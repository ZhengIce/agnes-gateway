import pytest

from app import db as appdb
from app import gateway_keys as gw
from app import stats


@pytest.fixture(autouse=True)
async def _db(monkeypatch, tmp_path):
    monkeypatch.setattr(appdb, "DB_PATH", tmp_path / "test.db")
    await appdb.init_db()
    gw._windows.clear()
    yield
    gw._windows.clear()


async def test_missing_key_401():
    with pytest.raises(gw.GatewayAuthError) as e:
        await gw.admit("", "text", None)
    assert e.value.status == 401


async def test_invalid_key_401():
    with pytest.raises(gw.GatewayAuthError) as e:
        await gw.admit("Bearer ag-notexist", "text", None)
    assert e.value.status == 401


async def test_rpm_limit_429():
    key = await gw.create_key("t", rpm_limits={"text": 2})
    assert (await gw.admit(f"Bearer {key}", "text", None)) is not None
    assert (await gw.admit(f"Bearer {key}", "text", None)) is not None
    with pytest.raises(gw.GatewayAuthError) as e:
        await gw.admit(f"Bearer {key}", "text", None)
    assert e.value.status == 429
    # image 类别独立计数
    assert (await gw.admit(f"Bearer {key}", "image", None)) is not None


async def test_disabled_403():
    key = await gw.create_key("t")
    await gw.update_key(1, {"enabled": False})
    with pytest.raises(gw.GatewayAuthError) as e:
        await gw.admit(f"Bearer {key}", "text", None)
    assert e.value.status == 403


async def test_model_whitelist_403():
    key = await gw.create_key("t", allowed_models=["agnes-2.5-flash"])
    assert (await gw.admit(f"Bearer {key}", "text", "agnes-2.5-flash")) is not None
    with pytest.raises(gw.GatewayAuthError) as e:
        await gw.admit(f"Bearer {key}", "text", "agnes-3.0-flash")
    assert e.value.status == 403


async def test_daily_token_quota_402():
    key = await gw.create_key("t", daily_token_quota=10)
    await stats.record(api_key_id=1, endpoint="v1/chat/completions", category="text",
                       model="agnes-2.5-flash", upstream_key_id=1, status=200,
                       latency_ms=1, prompt_tokens=100, completion_tokens=5)
    with pytest.raises(gw.GatewayAuthError) as e:
        await gw.admit(f"Bearer {key}", "text", None)
    assert e.value.status == 402


async def test_cost_quota_402():
    key = await gw.create_key("t", total_cost_quota=1.0)
    await stats.record(api_key_id=1, endpoint="v1/images/generations", category="image",
                       model="agnes-2.5-pro", upstream_key_id=1, status=200,
                       latency_ms=1, cost_yuan=2.0)
    with pytest.raises(gw.GatewayAuthError) as e:
        await gw.admit(f"Bearer {key}", "image", None)
    assert e.value.status == 402


async def test_quota_not_counting_other_keys():
    key = await gw.create_key("t", daily_token_quota=10)
    await stats.record(api_key_id=999, endpoint="e", category="text", model="m",
                       upstream_key_id=1, status=200, latency_ms=1, prompt_tokens=500)
    # 其他密钥的用量不影响本密钥配额
    assert (await gw.admit(f"Bearer {key}", "text", None)) is not None
