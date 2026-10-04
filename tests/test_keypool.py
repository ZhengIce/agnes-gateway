import pytest

from app import db as appdb
from app.config import settings
from app.keypool import KeyPool, parse_keys_text


@pytest.fixture(autouse=True)
async def _db(monkeypatch, tmp_path):
    monkeypatch.setattr(appdb, "DB_PATH", tmp_path / "test.db")
    await appdb.init_db()
    yield


@pytest.fixture
def small_limits(monkeypatch):
    limits = {"text": {"free": 2, "enterprise": 20, "token_plan": 1000},
              "image": {"free": 2, "enterprise": 40, "token_plan": 100},
              "video": {"free": 2, "enterprise": 2, "token_plan": 5}}
    monkeypatch.setattr(settings, "upstream_rpm_limits", limits)
    monkeypatch.setattr(settings, "cooldown_seconds", 60)


async def _make_pool(n=2):
    pool = KeyPool()
    await pool.add_keys([f"sk-test-{i}" for i in range(n)], key_type="free")
    return pool


async def test_acquire_respects_window(small_limits):
    pool = await _make_pool(2)
    ids = sorted(pool.acquire("text", allow_overflow=False).id for _ in range(4))
    assert ids == [1, 1, 2, 2]
    # 两个 Key 各 2 RPM 已用满 → 严格模式拒绝
    assert pool.acquire("text", allow_overflow=False) is None
    # 兜底模式仍可选出负载最低的 Key
    assert pool.acquire("text", allow_overflow=True) is not None


async def test_acquire_independent_categories(small_limits):
    pool = await _make_pool(1)
    assert pool.acquire("image", allow_overflow=False) is not None
    assert pool.acquire("video", allow_overflow=False) is not None
    assert pool.acquire("image", allow_overflow=False) is not None
    assert pool.acquire("image", allow_overflow=False) is None  # image 用满
    assert pool.acquire("video", allow_overflow=False) is not None  # video 独立计数


async def test_cooldown_on_429(small_limits):
    pool = await _make_pool(1)
    entry = pool.acquire("text", allow_overflow=False)
    pool.report_result(entry.id, 429)
    assert pool.cooldown_remaining(entry.id) > 0
    assert pool.acquire("text", allow_overflow=False) is None


async def test_disable_on_401(small_limits):
    pool = await _make_pool(2)
    entry = pool.acquire("text", allow_overflow=False)
    pool.report_result(entry.id, 401)
    # 401 → Key 被禁用，只剩另一个可用（2 RPM）
    assert pool.acquire("text", allow_overflow=False).id != entry.id
    assert pool.acquire("text", allow_overflow=False).id != entry.id
    assert pool.acquire("text", allow_overflow=False) is None


async def test_manual_type_does_not_override_free_scheduling(small_limits):
    pool = await _make_pool(1)
    await pool.update_key(1, {"type": "enterprise"})
    # Type controls are hidden; existing labels must also use the Free profile.
    assert pool.limit_for("enterprise", "text") == 2
    assert pool.limit_for("token_plan", "text") == 2
    for _ in range(2):
        assert pool.acquire("text", allow_overflow=False) is not None
    assert pool.acquire("text", allow_overflow=False) is None


async def test_add_keys_dedup(small_limits):
    pool = KeyPool()
    added, skipped = await pool.add_keys(["sk-dup", "sk-dup", "sk-other"], key_type="free")
    assert added == 2 and skipped == 1
    added2, skipped2 = await pool.add_keys(["sk-dup", "sk-new"], key_type="free")
    assert added2 == 1 and skipped2 == 1


async def test_acquire_by_id_forces_key(small_limits):
    pool = await _make_pool(2)
    entry = pool.acquire_by_id(2, "video")
    assert entry.id == 2


async def test_delete_key(small_limits):
    pool = await _make_pool(2)
    await pool.delete_key(1)
    assert pool.acquire("text", allow_overflow=False).id == 2


def test_parse_keys_text():
    text = "sk-abc123\n\nsk-def456\r\n说明文字\n"
    assert parse_keys_text(text) == ["sk-abc123", "sk-def456"]
    assert parse_keys_text("key1\nkey2") == ["key1", "key2"]  # 退回非空行
