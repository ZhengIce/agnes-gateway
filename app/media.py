"""Link-only media library. No fetching, downloading, or Base64 persistence."""
from __future__ import annotations

import hashlib
import logging
import math
from datetime import date
from urllib.parse import urlsplit

from . import db as appdb
from . import videotasks

logger = logging.getLogger(__name__)


def _text(value) -> str | None:
    return value if isinstance(value, str) and value else None


def _url(value) -> str | None:
    if not isinstance(value, str) or any(ord(char) < 32 for char in value):
        return None
    value = value.strip()
    try:
        parsed = urlsplit(value)
        if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
            return None
    except ValueError:
        return None
    return value


def _seconds(value) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        result = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return result if math.isfinite(result) and result >= 0 else None


async def _save(assets: list[dict]) -> None:
    async with appdb.connect() as conn:
        await conn.executemany(
            "INSERT INTO media_assets (identity, kind, url, model, prompt, size, ratio, seconds, "
            "api_key_id, upstream_key_id, video_id, created_at) "
            "VALUES (:identity,:kind,:url,:model,:prompt,:size,:ratio,:seconds,"
            ":api_key_id,:upstream_key_id,:video_id,:created_at) "
            "ON CONFLICT(identity) DO UPDATE SET url=excluded.url, "
            "size=COALESCE(:reported_size,media_assets.size), "
            "seconds=COALESCE(:reported_seconds,media_assets.seconds) "
            "WHERE media_assets.kind='video' AND media_assets.deleted_at IS NULL",
            assets,
        )
        await conn.commit()


async def capture_images(data: dict, request: dict, *, api_key_id: int, upstream_key_id: int) -> None:
    try:
        outputs = data.get("data")
        if not isinstance(outputs, list):
            return
        assets = []
        for output in outputs:
            url = _url(output.get("url")) if isinstance(output, dict) else None
            if url is None:
                continue
            assets.append({
                "identity": "image:" + hashlib.sha256(url.encode("utf-8")).hexdigest(),
                "kind": "image", "url": url,
                "model": _text(request.get("model")), "prompt": _text(request.get("prompt")),
                "size": _text(request.get("size")), "ratio": _text(request.get("ratio")),
                "seconds": None, "api_key_id": api_key_id, "upstream_key_id": upstream_key_id,
                "video_id": None, "created_at": appdb.now_str(),
                "reported_size": None, "reported_seconds": None,
            })
        if assets:
            await _save(assets)
    except Exception:
        logger.warning("Could not record generated image links", exc_info=True)


async def capture_video(data: dict, video_id: str, *, api_key_id: int, upstream_key_id: int,
                        model: str | None = None) -> None:
    try:
        if not video_id or data.get("status") != "completed":
            return
        url = _url(data.get("url"))
        if url is None:
            return
        task = await videotasks.details(video_id)
        metadata = task.get("metadata", {})
        seconds = _seconds(data.get("seconds"))
        await _save([{
            "identity": "video:" + video_id, "kind": "video", "url": url,
            "model": _text(metadata.get("model")) or _text(model),
            "prompt": _text(metadata.get("prompt")),
            "size": _text(data.get("size")) or _text(metadata.get("size")),
            "ratio": _text(metadata.get("aspect_ratio")),
            "seconds": seconds if seconds is not None else _seconds(metadata.get("seconds")),
            "api_key_id": task.get("api_key_id") or api_key_id,
            "upstream_key_id": task.get("upstream_key_id") or upstream_key_id,
            "video_id": video_id, "created_at": task.get("created_at") or appdb.now_str(),
            "reported_size": _text(data.get("size")), "reported_seconds": seconds,
        }])
    except Exception:
        logger.warning("Could not record generated video link", exc_info=True)


async def list_assets(kind: str, *, search: str = "", limit: int = 24, offset: int = 0,
                      start_date: date | None = None, end_date: date | None = None) -> dict:
    conditions = ["m.kind=?", "m.deleted_at IS NULL"]
    values: list = [kind]
    if kind == "video":
        limit = min(limit, 8)
    if start_date:
        conditions.append("m.created_at>=?")
        values.append(start_date.isoformat() + " 00:00:00")
    if end_date:
        conditions.append("m.created_at<=?")
        values.append(end_date.isoformat() + " 23:59:59")
    if search.strip():
        escaped = search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        conditions.append(
            "(m.prompt LIKE ? ESCAPE '\\' OR m.model LIKE ? ESCAPE '\\' "
            "OR m.url LIKE ? ESCAPE '\\' OR m.video_id LIKE ? ESCAPE '\\')"
        )
        values.extend([f"%{escaped}%"] * 4)
    where = " AND ".join(conditions)
    async with appdb.connect() as conn:
        row = await (await conn.execute(
            f"SELECT COUNT(*) FROM media_assets m WHERE {where}", values,
        )).fetchone()
        total = int(row[0])
        rows = await (await conn.execute(
            "SELECT m.id,m.kind,m.url,m.model,m.prompt,m.size,m.ratio,m.seconds,m.video_id,m.created_at,"
            "k.name AS api_key_name FROM media_assets m LEFT JOIN api_keys k ON k.id=m.api_key_id "
            f"WHERE {where} ORDER BY m.id DESC LIMIT ? OFFSET ?",
            (*values, limit, offset),
        )).fetchall()
    return {"total": total, "items": [dict(row) for row in rows]}


async def delete_asset(asset_id: int) -> bool:
    async with appdb.connect() as conn:
        # Keep only the deduplication marker so subsequent video polls cannot resurrect a deletion.
        cursor = await conn.execute(
            "UPDATE media_assets SET deleted_at=?,url='',model=NULL,prompt=NULL,size=NULL,ratio=NULL,"
            "seconds=NULL,api_key_id=NULL,upstream_key_id=NULL,video_id=NULL "
            "WHERE id=? AND deleted_at IS NULL",
            (appdb.now_str(), asset_id),
        )
        await conn.commit()
        return cursor.rowcount > 0
