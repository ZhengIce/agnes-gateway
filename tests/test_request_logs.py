"""Request log filters and complete accounting for video creation/query failures."""
from types import SimpleNamespace

import httpx
import pytest

from app import db as appdb
from app import gateway_keys as gw
from app import keypool, proxy, stats
from app.config import settings
from app.main import app


ADMIN = {"X-Admin-Token": "test-admin"}
MODEL = "agnes-video-2.5-flash"


@pytest.fixture
async def logged_gateway(monkeypatch, tmp_path):
    monkeypatch.setattr(appdb, "DB_PATH", tmp_path / "request-logs.db")
    monkeypatch.setattr(settings, "admin_token", "test-admin")
    monkeypatch.setattr(settings, "retry_backoff", 0)
    monkeypatch.setattr(settings, "max_retries", 1)
    await appdb.init_db()
    gw._windows.clear()
    pool = keypool.KeyPool()
    await pool.add_keys(["sk-logs-upstream"])
    monkeypatch.setattr(pool, "report_result", lambda *_: None)
    monkeypatch.setattr(keypool, "pool", pool)
    token = await gw.create_key("log-client", rpm_limits={"text": 100, "image": 100, "video": 100})
    replies = []

    def upstream(request):
        reply = replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        status, payload = reply
        return httpx.Response(status, json=payload)

    async with httpx.AsyncClient(base_url="https://upstream.test", transport=httpx.MockTransport(upstream)) as upstream_client:
        monkeypatch.setattr(proxy, "client", upstream_client)
        async with httpx.AsyncClient(base_url="http://gateway.test", transport=httpx.ASGITransport(app=app)) as client:
            yield SimpleNamespace(client=client, replies=replies, pool=pool, auth={"Authorization": f"Bearer {token}"})
    gw._windows.clear()


async def read_logs(gateway, **params):
    result = await gateway.client.get("/admin/api/logs", params=params, headers=ADMIN)
    assert result.status_code == 200
    return result.json()


async def test_exact_model_and_request_type_filters_with_global_model_choices(logged_gateway):
    for endpoint, category, model in (
        ("v1/videos", "video", MODEL), ("agnesapi", "video", MODEL),
        ("v1/videos", "video", "agnes-video-2.5"),
        ("v1/images/generations", "image", "agnes-image-2.5-flash"),
        ("v1/models", "text", None),
    ):
        await stats.record(api_key_id=1, endpoint=endpoint, category=category, model=model,
                           upstream_key_id=1, status=200, latency_ms=1)
    data = await read_logs(logged_gateway, model="agnes-video-2.5", model_exact="true", request_type="video_create")
    assert data["total"] == 1
    assert data["logs"][0]["model"] == "agnes-video-2.5"
    assert data["logs"][0]["request_type"] == "video_create"
    assert data["models"] == ["agnes-image-2.5-flash", "agnes-video-2.5", MODEL]
    assert (await read_logs(logged_gateway, model="agnes-video-2.5"))["total"] == 3
    assert (await read_logs(logged_gateway, request_type="video_query"))["total"] == 1
    assert (await read_logs(logged_gateway, request_type="text"))["total"] == 0
    assert (await read_logs(logged_gateway, request_type="models"))["total"] == 1


async def test_video_creation_and_raw_query_are_both_logged_under_the_original_model(logged_gateway):
    logged_gateway.replies.extend([
        (200, {"video_id": "log-video", "status": "queued"}),
        (200, {"status": "completed", "url": "https://cdn.test/result.mp4"}),
    ])
    result = await logged_gateway.client.post("/v1/videos", headers=logged_gateway.auth,
        json={"model": MODEL, "prompt": "waves", "seconds": "5"})
    assert result.status_code == 200
    result = await logged_gateway.client.get("/agnesapi", headers=logged_gateway.auth, params={"video_id": "log-video"})
    assert result.status_code == 200
    data = await read_logs(logged_gateway, model=MODEL, model_exact="true")
    assert data["total"] == 2
    assert {item["request_type"] for item in data["logs"]} == {"video_create", "video_query"}
    assert sum(item["video_seconds"] or 0 for item in data["logs"]) == 5


@pytest.mark.parametrize("method,path", [("POST", "/v1/videos"), ("GET", "/v1/videos/missing")])
@pytest.mark.parametrize("failure", ["empty_pool", "timeout"])
async def test_unavailable_pool_and_network_failures_are_logged(logged_gateway, method, path, failure):
    if failure == "empty_pool":
        monkey_key = logged_gateway.pool._keys[1]
        monkey_key.enabled = False
    else:
        logged_gateway.replies.append(httpx.ReadTimeout("simulated timeout"))
    result = await logged_gateway.client.request(method, path, headers=logged_gateway.auth,
        **({"json": {"model": MODEL, "prompt": "waves"}} if method == "POST" else {"params": {"model_name": MODEL}}))
    expected = 429 if failure == "empty_pool" else 504
    assert result.status_code == expected
    data = await read_logs(logged_gateway, model=MODEL, model_exact="true", status="error")
    assert data["total"] == 1
    assert data["logs"][0]["status"] == expected
    assert data["logs"][0]["error"]
    assert data["logs"][0]["request_type"] == ("video_create" if method == "POST" else "video_query")
