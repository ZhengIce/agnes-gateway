"""管理端 API：登录、对外密钥 CRUD、上游池管理（单个/多行/文件导入、验证）、统计、配置。"""
from __future__ import annotations

from typing import Literal
from datetime import date

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel

from app import db as appdb
from app import gateway_keys as gw
from app import keypool, media, stats, model_catalog
from app.config import CONFIG_PATH, settings

router = APIRouter(prefix="/admin/api")


async def require_admin(x_admin_token: str = Header(default="", alias="X-Admin-Token")):
    if not settings.admin_token or x_admin_token != settings.admin_token:
        raise HTTPException(status_code=401, detail="无效的管理令牌")


# ---------- 登录 ----------

class LoginBody(BaseModel):
    token: str


@router.post("/login")
async def login(body: LoginBody):
    if not settings.admin_token or body.token != settings.admin_token:
        raise HTTPException(status_code=401, detail="管理令牌错误")
    return {"ok": True}


# ---------- 上游 Agnes 密钥池 ----------

async def _pool_db_rows() -> dict:
    async with appdb.connect() as conn:
        rows = await (await conn.execute(
            "SELECT id, success_count, error_count, last_used_at FROM upstream_keys")).fetchall()
    return {r["id"]: dict(r) for r in rows}


@router.get("/pool")
async def pool_status(_: None = Depends(require_admin)):
    rows = await _pool_db_rows()
    return {"keys": keypool.pool.list_status(rows)}


class PoolAddBody(BaseModel):
    keys: list[str]
    type: str = "free"


@router.post("/pool/keys")
async def pool_add(body: PoolAddBody, _: None = Depends(require_admin)):
    if body.type not in ("free", "enterprise", "token_plan"):
        raise HTTPException(status_code=400, detail="type 必须是 free/enterprise/token_plan")
    added, skipped = await keypool.pool.add_keys(keypool.parse_keys_text("\n".join(body.keys)), body.type)
    return {"added": added, "skipped": skipped}


@router.post("/pool/upload")
async def pool_upload(file: UploadFile = File(...), type: str = Form("free"),
                      _: None = Depends(require_admin)):
    if type not in ("free", "enterprise", "token_plan"):
        raise HTTPException(status_code=400, detail="type 必须是 free/enterprise/token_plan")
    text = (await file.read()).decode("utf-8", "replace")
    keys = keypool.parse_keys_text(text)
    if not keys:
        raise HTTPException(status_code=400, detail="文件中未识别到任何密钥（期望每行一个 sk- 开头的密钥）")
    added, skipped = await keypool.pool.add_keys(keys, type)
    return {"parsed": len(keys), "added": added, "skipped": skipped}


class PoolPatchBody(BaseModel):
    type: str | None = None
    enabled: bool | None = None
    name: str | None = None


@router.patch("/pool/keys/{key_id}")
async def pool_patch(key_id: int, body: PoolPatchBody, _: None = Depends(require_admin)):
    await keypool.pool.update_key(key_id, body.model_dump(exclude_none=True))
    return {"ok": True}


@router.delete("/pool/keys/{key_id}")
async def pool_delete(key_id: int, _: None = Depends(require_admin)):
    await keypool.pool.delete_key(key_id)
    return {"ok": True}


class PoolBatchBody(BaseModel):
    ids: list[int]
    action: str  # enable | disable | delete


@router.post("/pool/batch")
async def pool_batch(body: PoolBatchBody, _: None = Depends(require_admin)):
    if body.action not in ("enable", "disable", "delete"):
        raise HTTPException(status_code=400, detail="action 必须是 enable/disable/delete")
    for key_id in body.ids:
        if body.action == "delete":
            await keypool.pool.delete_key(key_id)
        else:
            await keypool.pool.update_key(key_id, {"enabled": body.action == "enable"})
    return {"ok": True, "affected": len(body.ids)}


@router.post("/pool/keys/{key_id}/validate")
async def pool_validate(key_id: int, _: None = Depends(require_admin)):
    valid = await keypool.pool.validate(key_id)
    return {"valid": valid}


# ---------- 对外密钥 ----------

@router.get("/keys")
async def gateway_keys_list(_: None = Depends(require_admin)):
    return {"keys": await gw.list_keys()}


class GatewayKeyBody(BaseModel):
    name: str
    rpm_limits: dict | None = None          # {"text":60,"image":20,"video":10}
    daily_token_quota: int | None = None
    total_cost_quota: float | None = None
    allowed_models: list[str] | None = None
    expires_at: str | None = None           # "YYYY-MM-DD HH:MM:SS" 或 null


@router.post("/keys")
async def gateway_keys_create(body: GatewayKeyBody, _: None = Depends(require_admin)):
    key = await gw.create_key(
        body.name, rpm_limits=body.rpm_limits, daily_token_quota=body.daily_token_quota,
        total_cost_quota=body.total_cost_quota, allowed_models=body.allowed_models,
        expires_at=body.expires_at,
    )
    return {"ok": True, "key": key}


class GatewayKeyPatchBody(BaseModel):
    name: str | None = None
    enabled: bool | None = None
    rpm_limits: dict | None = None
    daily_token_quota: int | None = None
    total_cost_quota: float | None = None
    allowed_models: list[str] | None = None
    expires_at: str | None = None


@router.patch("/keys/{key_id}")
async def gateway_keys_patch(key_id: int, body: GatewayKeyPatchBody, _: None = Depends(require_admin)):
    await gw.update_key(key_id, body.model_dump(exclude_none=True))
    return {"ok": True}


@router.delete("/keys/{key_id}")
async def gateway_keys_delete(key_id: int, _: None = Depends(require_admin)):
    await gw.delete_key(key_id)
    return {"ok": True}


# ---------- 图片库与视频库 ----------

@router.get("/models")
async def models_list(refresh: bool = False, _: None = Depends(require_admin)):
    return await model_catalog.catalog(refresh=refresh)

@router.get("/media")
async def media_list(kind: Literal["image", "video"], search: str = "",
                     limit: int = Query(default=24, ge=1, le=100),
                     offset: int = Query(default=0, ge=0),
                     start_date: date | None = None, end_date: date | None = None,
                     _: None = Depends(require_admin)):
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=400, detail="开始日期不能晚于结束日期")
    return await media.list_assets(kind, search=search, limit=limit, offset=offset,
                                   start_date=start_date, end_date=end_date)


@router.delete("/media/{asset_id}")
async def media_delete(asset_id: int, _: None = Depends(require_admin)):
    if not await media.delete_asset(asset_id):
        raise HTTPException(status_code=404, detail="媒体记录不存在或已删除")
    return {"ok": True}


# ---------- 统计与配置 ----------

@router.get("/overview")
async def overview(request: Request, _: None = Depends(require_admin)):
    rng = request.query_params.get("range", "24h")
    if rng == "7d":
        return await stats.overview(hours=168, bucket="day")
    return await stats.overview(hours=24, bucket="hour")


@router.get("/logs")
async def logs(request: Request, _: None = Depends(require_admin)):
    q = request.query_params
    api_key_id = int(q["api_key_id"]) if q.get("api_key_id") else None
    return await stats.logs(
        limit=int(q.get("limit", 50)), offset=int(q.get("offset", 0)),
        api_key_id=api_key_id, model=q.get("model") or None, status_filter=q.get("status") or None,
        model_exact=q.get("model_exact") == "true", request_type_filter=q.get("request_type") or None,
    )


@router.get("/config")
async def get_config(_: None = Depends(require_admin)):
    return {
        "path": str(CONFIG_PATH),
        "config": {
            "host": settings.host, "port": settings.port,
            "base_url": settings.base_url, "timeouts": settings.timeouts,
            "upstream_rpm_limits": settings.upstream_rpm_limits,
            "cooldown_seconds": settings.cooldown_seconds,
            "max_retries": settings.max_retries, "retry_backoff": settings.retry_backoff,
            "gateway_default_rpm": settings.gateway_default_rpm,
            "model_aliases": settings.model_aliases, "failover": settings.failover,
            "pricing": settings.pricing,
        },
    }


@router.post("/config/reload")
async def reload_config(_: None = Depends(require_admin)):
    settings.reload()
    return {"ok": True}
