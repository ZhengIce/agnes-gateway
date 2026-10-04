"""视频任务归属：Agnes 的视频任务与创建它的上游 Key 绑定，查询必须用同一 Key。"""
from __future__ import annotations

import json
import logging

from . import db as appdb

logger = logging.getLogger(__name__)


async def remember(video_id: str, upstream_key_id: int, *, api_key_id: int | None = None,
                   metadata: dict | None = None) -> None:
    selected = None
    if metadata is not None:
        # Retain generation metadata, never reference images/audio or Base64 bodies.
        selected = {
            k: v for k, v in metadata.items()
            if k in ("model", "prompt", "size", "aspect_ratio", "seconds")
            and isinstance(v, (str, int, float)) and not isinstance(v, bool)
        }
    try:
        async with appdb.connect() as conn:
            await conn.execute(
                "INSERT INTO video_tasks (video_id, upstream_key_id, created_at, api_key_id, request_metadata) "
                "VALUES (?,?,?,?,?) ON CONFLICT(video_id) DO UPDATE SET "
                "upstream_key_id=excluded.upstream_key_id, "
                "api_key_id=COALESCE(excluded.api_key_id, video_tasks.api_key_id), "
                "request_metadata=COALESCE(excluded.request_metadata, video_tasks.request_metadata)",
                (video_id, upstream_key_id, appdb.now_str(), api_key_id,
                 json.dumps(selected, ensure_ascii=False) if selected is not None else None),
            )
            await conn.commit()
    except Exception:
        logger.warning("Could not record video task metadata", exc_info=True)


async def details(video_id: str) -> dict:
    async with appdb.connect() as conn:
        row = await (await conn.execute(
            "SELECT * FROM video_tasks WHERE video_id=?", (video_id,))).fetchone()
    if row is None:
        return {}
    result = dict(row)
    try:
        metadata = json.loads(result.pop("request_metadata") or "{}")
    except (ValueError, TypeError):
        metadata = {}
    result["metadata"] = metadata if isinstance(metadata, dict) else {}
    return result


async def lookup(video_id: str) -> int | None:
    try:
        async with appdb.connect() as conn:
            row = await (await conn.execute(
                "SELECT upstream_key_id FROM video_tasks WHERE video_id=?", (video_id,))).fetchone()
        return int(row["upstream_key_id"]) if row else None
    except Exception:
        return None
