"""Verify which layer limits a request and when upstream key rotation occurs."""
import httpx
import pytest

from app import db as appdb
from app import gateway_keys as gw
from app import keypool, proxy
from app.config import settings
from app.main import app


@pytest.fixture
async def gateway(monkeypatch, tmp_path):
    monkeypatch.setattr(appdb, "DB_PATH", tmp_path / "failover.db")
    monkeypatch.setattr(settings, "retry_backoff", 0)
    monkeypatch.setattr(settings, "max_retries", 3)
    await appdb.init_db()
    gw._windows.clear()
    pool = keypool.KeyPool()
    await pool.add_keys(["sk-test-upstream-a", "sk-test-upstream-b"])

    async def ignore_counts(*args, **kwargs):
        pass

    # Keep actual cooldown and selection; avoid unrelated background DB writes.
    monkeypatch.setattr(pool, "_bump_counts", ignore_counts)
    monkeypatch.setattr(keypool, "pool", pool)
    token = await gw.create_key("limited-client", rpm_limits={"text": 2})
    requests = []
    responses = []

    def upstream(request):
        requests.append(request)
        status = responses.pop(0) if responses else 200
        payload = {"error": {"message": "upstream rate limit"}} if status == 429 else {
            "choices": [{"message": {"role": "assistant", "content": "ok"}}],
            "usage": {"prompt_tokens": 1, "completion_tokens": 1},
        }
        return httpx.Response(status, json=payload)

    async with httpx.AsyncClient(base_url="https://upstream.test", transport=httpx.MockTransport(upstream)) as upstream_client:
        monkeypatch.setattr(proxy, "client", upstream_client)
        async with httpx.AsyncClient(base_url="http://gateway.test", transport=httpx.ASGITransport(app=app)) as client:
            yield client, {"Authorization": f"Bearer {token}"}, pool, requests, responses
    gw._windows.clear()


async def test_upstream_429_cools_key_and_retries_same_request_with_another_key(gateway):
    client, auth, pool, requests, responses = gateway
    responses.extend([429, 200])
    result = await client.post("/v1/chat/completions", headers=auth, json={
        "model": "agnes-3.0-flash", "messages": [{"role": "user", "content": "hello"}],
    })
    assert result.status_code == 200
    assert len(requests) == 2
    assert requests[0].headers["authorization"] != requests[1].headers["authorization"]
    assert requests[0].content == requests[1].content
    assert pool.cooldown_remaining(1) > 0
    assert gw.rpm_usage(1, "text") == 1  # Retries do not spend another gateway allowance.


async def test_gateway_limit_rejects_before_upstream_selection_even_with_spare_keys(gateway):
    client, auth, pool, requests, _ = gateway
    for _ in range(2):
        result = await client.post("/v1/chat/completions", headers=auth, json={
            "model": "agnes-3.0-flash", "messages": [{"role": "user", "content": "hello"}],
        })
        assert result.status_code == 200
    result = await client.post("/v1/chat/completions", headers=auth, json={
        "model": "agnes-3.0-flash", "messages": [{"role": "user", "content": "third"}],
    })
    assert result.status_code == 429
    assert result.json()["error"]["code"] == "rate_limit_exceeded"
    assert "2 RPM" in result.json()["error"]["message"]
    assert len(requests) == 2
    assert all(pool.cooldown_remaining(key_id) == 0 for key_id in (1, 2))
