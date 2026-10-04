"""对外密钥（ag- 前缀）：签发、鉴权、RPM 限流、配额检查与 CRUD。"""
from __future__ import annotations

import json
import secrets
import time
from collections import deque
from dataclasses import dataclass

from . import db as appdb
from .config import settings


class GatewayAuthError(Exception):
    """对外密钥鉴权/限额错误 → 转换为 OpenAI 风格错误响应。"""

    def __init__(self, status: int, message: str, err_type: str = "invalid_request_error", code: str | None = None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.err_type = err_type
        self.code = code


@dataclass
class GatewayKeyContext:
    id: int
    key: str
    name: str
    rpm_limits: dict


# (api_key_id, category) → 60s 滑动窗口内的请求时间戳
_windows: dict[tuple[int, str], deque] = {}


def generate_key() -> str:
    return "ag-" + secrets.token_hex(16)


def _effective_rpm(row, category: str) -> int:
    limits = {k: int(v) for k, v in settings.gateway_default_rpm.items()}
    if row["rpm_limits"]:
        try:
            custom = json.loads(row["rpm_limits"])
            if isinstance(custom, dict):
                for k, v in custom.items():
                    if v:
                        limits[str(k)] = int(v)
        except (ValueError, TypeError):
            pass
    return int(limits.get(category, 60))


def _rpm_available(key_id: int, category: str, limit: int, record: bool = True) -> bool:
    now = time.monotonic()
    win = _windows.setdefault((key_id, category), deque())
    while win and now - win[0] > 60.0:
        win.popleft()
    if len(win) >= limit:
        return False
    if record:
        win.append(now)
    return True


def rpm_usage(key_id: int, category: str) -> int:
    win = _windows.get((key_id, category))
    if not win:
        return 0
    now = time.monotonic()
    while win and now - win[0] > 60.0:
        win.popleft()
    return len(win)


async def admit(auth_header: str, category: str, model: str | None) -> GatewayKeyContext:
    """鉴权 + 限流 + 配额三连检查，通过返回上下文，否则抛 GatewayAuthError。"""
    token = ""
    if auth_header.lower().startswith("bearer "):
        token = auth_header[7:].strip()
    if not token:
        raise GatewayAuthError(401, "缺少 API 密钥，请携带 Authorization: Bearer ag-xxx",
                               "invalid_request_error", "missing_api_key")

    async with appdb.connect() as conn:
        row = await (await conn.execute("SELECT * FROM api_keys WHERE key = ?", (token,))).fetchone()

    if row is None:
        raise GatewayAuthError(401, "无效的 API 密钥", "invalid_request_error", "invalid_api_key")
    if not row["enabled"]:
        raise GatewayAuthError(403, "该 API 密钥已被禁用", "invalid_request_error", "key_disabled")
    if row["expires_at"] and row["expires_at"] < appdb.now_str():
        raise GatewayAuthError(403, "该 API 密钥已过期", "invalid_request_error", "key_expired")

    if model and row["allowed_models"]:
        try:
            allowed = json.loads(row["allowed_models"])
        except (ValueError, TypeError):
            allowed = []
        if isinstance(allowed, list) and allowed and model not in allowed:
            raise GatewayAuthError(403, f"该密钥无权访问模型 {model}", "invalid_request_error", "model_not_allowed")

    limit = _effective_rpm(row, category)
    if not _rpm_available(row["id"], category, limit):
        raise GatewayAuthError(429, f"请求过于频繁：{category} 类别上限 {limit} RPM，请稍后重试",
                               "rate_limit_error", "rate_limit_exceeded")

    if row["daily_token_quota"] is not None:
        used = await tokens_today(row["id"])
        if used >= int(row["daily_token_quota"]):
            raise GatewayAuthError(402, f"已达每日 Token 配额（{row['daily_token_quota']}），明日恢复",
                                   "insufficient_quota", "daily_quota_exceeded")

    if row["total_cost_quota"] is not None:
        total = await cost_total(row["id"])
        if total >= float(row["total_cost_quota"]):
            raise GatewayAuthError(402, f"已达累计成本上限（¥{row['total_cost_quota']}）",
                                   "insufficient_quota", "cost_quota_exceeded")

    return GatewayKeyContext(
        id=row["id"], key=row["key"], name=row["name"],
        rpm_limits={cat: _effective_rpm(row, cat) for cat in ("text", "image", "video")},
    )


async def tokens_today(api_key_id: int) -> int:
    async with appdb.connect() as conn:
        cur = await conn.execute(
            "SELECT COALESCE(SUM(COALESCE(prompt_tokens,0)+COALESCE(completion_tokens,0)),0) "
            "FROM requests WHERE api_key_id=? AND ts LIKE ?",
            (api_key_id, appdb.today_prefix() + "%"),
        )
        return int((await cur.fetchone())[0])


async def cost_total(api_key_id: int) -> float:
    async with appdb.connect() as conn:
        cur = await conn.execute("SELECT COALESCE(SUM(cost_yuan),0) FROM requests WHERE api_key_id=?", (api_key_id,))
        return float((await cur.fetchone())[0])


# ---------- CRUD（供 admin 路由调用） ----------

async def create_key(name: str, *, rpm_limits: dict | None = None, daily_token_quota: int | None = None,
                     total_cost_quota: float | None = None, allowed_models: list | None = None,
                     expires_at: str | None = None) -> str:
    key = generate_key()
    async with appdb.connect() as conn:
        await conn.execute(
            "INSERT INTO api_keys (key, name, rpm_limits, daily_token_quota, total_cost_quota, allowed_models, expires_at, created_at) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (
                key, name or "未命名",
                json.dumps(rpm_limits) if rpm_limits else None,
                daily_token_quota, total_cost_quota,
                json.dumps(allowed_models) if allowed_models else None,
                expires_at, appdb.now_str(),
            ),
        )
        await conn.commit()
    return key


async def update_key(key_id: int, fields: dict) -> None:
    allowed = {"name", "enabled", "rpm_limits", "daily_token_quota", "total_cost_quota", "allowed_models", "expires_at"}
    sets, vals = [], []
    for k, v in fields.items():
        if k not in allowed:
            continue
        if k in ("rpm_limits", "allowed_models") and v is not None:
            v = json.dumps(v)
        sets.append(f"{k}=?")
        vals.append(v)
    if not sets:
        return
    async with appdb.connect() as conn:
        await conn.execute(f"UPDATE api_keys SET {', '.join(sets)} WHERE id=?", (*vals, key_id))
        await conn.commit()


async def delete_key(key_id: int) -> None:
    async with appdb.connect() as conn:
        await conn.execute("DELETE FROM api_keys WHERE id=?", (key_id,))
        await conn.commit()


async def list_keys() -> list[dict]:
    async with appdb.connect() as conn:
        rows = await (await conn.execute("SELECT * FROM api_keys ORDER BY id")).fetchall()
        usage_rows = await (await conn.execute(
            "SELECT api_key_id, COUNT(*) AS requests, "
            "COALESCE(SUM(COALESCE(prompt_tokens,0)+COALESCE(completion_tokens,0)),0) AS tokens, "
            "COALESCE(SUM(cost_yuan),0) AS cost "
            "FROM requests GROUP BY api_key_id"
        )).fetchall()
    usage = {r["api_key_id"]: dict(r) for r in usage_rows}
    result = []
    for r in rows:
        d = dict(r)
        u = usage.get(r["id"], {})
        d["usage"] = {
            "requests": int(u.get("requests", 0)),
            "tokens": int(u.get("tokens", 0)),
            "cost": float(u.get("cost", 0)),
        }
        d["tokens_today"] = await tokens_today(r["id"])
        for j in ("rpm_limits", "allowed_models"):
            if d.get(j):
                try:
                    d[j] = json.loads(d[j])
                except (ValueError, TypeError):
                    d[j] = None
        d["masked"] = d["key"][:6] + "…" + d["key"][-4:]
        result.append(d)
    return result
