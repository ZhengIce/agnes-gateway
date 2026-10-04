"""请求日志写入与用量聚合查询。"""
from __future__ import annotations

from datetime import timedelta
import logging

from . import db as appdb

logger = logging.getLogger(__name__)

# Keep task polling separate from generation without discarding either kind of call.
REQUEST_TYPES = {
    "text": "r.category='text' AND r.endpoint NOT IN ('v1/models','models')",
    "image": "r.category='image'",
    "video_create": "r.category='video' AND r.endpoint!='agnesapi'",
    "video_query": "r.category='video' AND r.endpoint='agnesapi'",
    "models": "r.endpoint IN ('v1/models','models')",
}


def request_type(row: dict) -> str:
    if row["endpoint"] in ("v1/models", "models"):
        return "models"
    if row["category"] == "video":
        return "video_query" if row["endpoint"] == "agnesapi" else "video_create"
    return row["category"]


async def record(*, api_key_id: int | None, endpoint: str, category: str, model: str | None,
                 upstream_key_id: int | None, status: int, latency_ms: int, stream: bool = False,
                 prompt_tokens: int | None = None, completion_tokens: int | None = None,
                 image_count: int | None = None, image_size: str | None = None,
                 video_seconds: float | None = None, cost_yuan: float = 0.0,
                 error: str | None = None) -> None:
    try:
        async with appdb.connect() as conn:
            await conn.execute(
                "INSERT INTO requests (ts, api_key_id, endpoint, category, model, upstream_key_id, status, "
                "latency_ms, stream, prompt_tokens, completion_tokens, image_count, image_size, video_seconds, "
                "cost_yuan, error) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    appdb.now_str(), api_key_id, endpoint, category, model, upstream_key_id, int(status),
                    int(latency_ms), int(stream), prompt_tokens, completion_tokens, image_count, image_size,
                    video_seconds, cost_yuan, (error[:500] if error else None),
                ),
            )
            await conn.commit()
    except Exception:
        logger.warning("Could not record request log", exc_info=True)


async def overview(hours: int, bucket: str = "hour") -> dict:
    since = (appdb.datetime.now() - timedelta(hours=hours)).strftime("%Y-%m-%d %H:%M:%S")
    trunc = 13 if bucket == "hour" else 10  # 'YYYY-MM-DD HH' / 'YYYY-MM-DD'
    async with appdb.connect() as conn:
        row = await (await conn.execute(
            "SELECT COUNT(*) AS requests, "
            "COALESCE(SUM(COALESCE(prompt_tokens,0)+COALESCE(completion_tokens,0)),0) AS tokens, "
            "COALESCE(SUM(cost_yuan),0) AS cost, "
            "COALESCE(SUM(CASE WHEN status>=400 THEN 1 ELSE 0 END),0) AS errors "
            "FROM requests WHERE ts >= ?", (since,)
        )).fetchone()
        series_rows = await (await conn.execute(
            f"SELECT substr(ts,1,{trunc}) AS bucket, COUNT(*) AS requests, "
            "COALESCE(SUM(COALESCE(prompt_tokens,0)+COALESCE(completion_tokens,0)),0) AS tokens, "
            "COALESCE(SUM(cost_yuan),0) AS cost "
            "FROM requests WHERE ts >= ? GROUP BY bucket ORDER BY bucket", (since,)
        )).fetchall()
        model_rows = await (await conn.execute(
            "SELECT COALESCE(model,'(未知)') AS model, COUNT(*) AS requests, "
            "COALESCE(SUM(COALESCE(prompt_tokens,0)+COALESCE(completion_tokens,0)),0) AS tokens, "
            "COALESCE(SUM(cost_yuan),0) AS cost "
            "FROM requests WHERE ts >= ? GROUP BY model ORDER BY requests DESC LIMIT 20", (since,)
        )).fetchall()
        key_rows = await (await conn.execute(
            "SELECT COALESCE(k.name,'(已删除)') AS name, COUNT(*) AS requests, "
            "COALESCE(SUM(COALESCE(prompt_tokens,0)+COALESCE(completion_tokens,0)),0) AS tokens, "
            "COALESCE(SUM(r.cost_yuan),0) AS cost "
            "FROM requests r LEFT JOIN api_keys k ON k.id = r.api_key_id "
            "WHERE r.ts >= ? GROUP BY r.api_key_id ORDER BY requests DESC LIMIT 20", (since,)
        )).fetchall()

    total = int(row["requests"])
    errors = int(row["errors"])
    return {
        "totals": {
            "requests": total,
            "tokens": int(row["tokens"]),
            "cost": float(row["cost"]),
            "errors": errors,
            "error_rate": round(errors / total, 4) if total else 0,
        },
        "series": [dict(r) for r in series_rows],
        "by_model": [dict(r) for r in model_rows],
        "by_key": [dict(r) for r in key_rows],
    }


async def logs(limit: int = 50, offset: int = 0, api_key_id: int | None = None,
               model: str | None = None, status_filter: str | None = None,
               model_exact: bool = False, request_type_filter: str | None = None) -> dict:
    conds, vals = [], []
    if api_key_id:
        conds.append("r.api_key_id=?")
        vals.append(api_key_id)
    if model:
        conds.append("r.model=?" if model_exact else "r.model LIKE ?")
        vals.append(model if model_exact else f"%{model}%")
    if request_type_filter in REQUEST_TYPES:
        conds.append("(" + REQUEST_TYPES[request_type_filter] + ")")
    if status_filter == "success":
        conds.append("r.status < 400")
    elif status_filter == "error":
        conds.append("r.status >= 400")

    where = (" WHERE " + " AND ".join(conds)) if conds else ""
    async with appdb.connect() as conn:
        total = int((await (await conn.execute(f"SELECT COUNT(*) FROM requests r{where}", vals)).fetchone())[0])
        rows = await (await conn.execute(
            "SELECT r.*, k.name AS api_key_name FROM requests r "
            "LEFT JOIN api_keys k ON k.id = r.api_key_id" + where +
            " ORDER BY r.id DESC LIMIT ? OFFSET ?",
            (*vals, min(limit, 500), max(offset, 0)),
        )).fetchall()
        models = await (await conn.execute(
            "SELECT DISTINCT model FROM requests WHERE model IS NOT NULL AND model!='' ORDER BY model"
        )).fetchall()
    items = [dict(r) for r in rows]
    for item in items:
        item["request_type"] = request_type(item)
    return {"total": total, "logs": items, "models": [row["model"] for row in models]}
