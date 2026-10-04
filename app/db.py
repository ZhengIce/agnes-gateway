"""SQLite(WAL) 连接与建表。所有密钥资产与请求日志存于 data/gateway.db。"""
from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

import aiosqlite

from .config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS upstream_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'free',
    enabled INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'unknown',
    added_at TEXT NOT NULL,
    last_used_at TEXT,
    success_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    rpm_limits TEXT,
    daily_token_quota INTEGER,
    total_cost_quota REAL,
    allowed_models TEXT,
    expires_at TEXT,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    api_key_id INTEGER,
    endpoint TEXT NOT NULL,
    category TEXT NOT NULL,
    model TEXT,
    upstream_key_id INTEGER,
    status INTEGER NOT NULL,
    latency_ms INTEGER,
    stream INTEGER NOT NULL DEFAULT 0,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    image_count INTEGER,
    image_size TEXT,
    video_seconds REAL,
    cost_yuan REAL NOT NULL DEFAULT 0,
    error TEXT
);
CREATE TABLE IF NOT EXISTS video_tasks (
    video_id TEXT PRIMARY KEY,
    upstream_key_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    api_key_id INTEGER,
    request_metadata TEXT
);
CREATE TABLE IF NOT EXISTS media_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    identity TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL CHECK(kind IN ('image', 'video')),
    url TEXT NOT NULL,
    model TEXT,
    prompt TEXT,
    size TEXT,
    ratio TEXT,
    seconds REAL,
    api_key_id INTEGER,
    upstream_key_id INTEGER,
    video_id TEXT,
    created_at TEXT NOT NULL,
    deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_requests_ts ON requests(ts);
CREATE INDEX IF NOT EXISTS idx_requests_api_key ON requests(api_key_id);
CREATE INDEX IF NOT EXISTS idx_requests_model ON requests(model);
CREATE INDEX IF NOT EXISTS idx_media_kind ON media_assets(kind, deleted_at, id);
"""


def now_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def today_prefix() -> str:
    return datetime.now().strftime("%Y-%m-%d")


@asynccontextmanager
async def connect(db_path: Path | None = None):
    """用法：async with appdb.connect() as conn: ... （调用方自行 commit）"""
    path = db_path if db_path is not None else DB_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = await aiosqlite.connect(path)
    conn.row_factory = aiosqlite.Row
    try:
        pragma = await conn.execute("PRAGMA journal_mode=WAL")
        await pragma.close()
        yield conn
    finally:
        await conn.close()


async def init_db(db_path: Path | None = None) -> None:
    async with connect(db_path) as conn:
        await conn.executescript(SCHEMA)
        columns = {row["name"] for row in await (await conn.execute("PRAGMA table_info(video_tasks)")).fetchall()}
        for name, column_type in (("api_key_id", "INTEGER"), ("request_metadata", "TEXT")):
            if name not in columns:
                await conn.execute(f"ALTER TABLE video_tasks ADD COLUMN {name} {column_type}")
        await conn.commit()
