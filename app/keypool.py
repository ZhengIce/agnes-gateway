"""上游 Agnes Key 池：DB 加载与热更新、滑动窗口限流、最少负载选 Key、冷却与禁用、增删改查。"""
from __future__ import annotations

import asyncio
import re
import time
from collections import deque
from dataclasses import dataclass, field

import httpx

from . import db as appdb
from .config import settings


@dataclass
class UpstreamKey:
    id: int
    key: str
    name: str
    type: str
    enabled: bool
    status: str


@dataclass
class _KeyRuntime:
    windows: dict = field(default_factory=dict)  # category -> deque
    cooldown_until: float = 0.0


class KeyPool:
    def __init__(self) -> None:
        self._keys: dict[int, UpstreamKey] = {}
        self._rt: dict[int, _KeyRuntime] = {}

    # ---------- 加载 ----------

    async def load(self) -> None:
        async with appdb.connect() as conn:
            rows = await (await conn.execute("SELECT * FROM upstream_keys")).fetchall()
        for r in rows:
            self._keys[r["id"]] = UpstreamKey(
                id=r["id"], key=r["key"], name=r["name"], type=r["type"],
                enabled=bool(r["enabled"]), status=r["status"],
            )
            self._rt.setdefault(r["id"], _KeyRuntime())

    async def reload_key(self, key_id: int) -> None:
        async with appdb.connect() as conn:
            row = await (await conn.execute("SELECT * FROM upstream_keys WHERE id=?", (key_id,))).fetchone()
        if row is None:
            self._keys.pop(key_id, None)
            self._rt.pop(key_id, None)
        else:
            self._keys[key_id] = UpstreamKey(
                id=row["id"], key=row["key"], name=row["name"], type=row["type"],
                enabled=bool(row["enabled"]), status=row["status"],
            )
            self._rt.setdefault(key_id, _KeyRuntime())

    # ---------- 选 Key ----------

    def limit_for(self, key_type: str, category: str) -> int:
        # Type detection is unavailable. Use the Free scheduling profile for
        # every key, including previously imported keys with manual labels.
        return int(settings.upstream_rpm_limits.get(category, {}).get("free", 10))

    def _window(self, key_id: int, category: str) -> deque:
        rt = self._rt.setdefault(key_id, _KeyRuntime())
        win = rt.windows.setdefault(category, deque())
        now = time.monotonic()
        while win and now - win[0] > 60.0:
            win.popleft()
        return win

    def rpm_used(self, key_id: int, category: str) -> int:
        return len(self._window(key_id, category))

    def cooldown_remaining(self, key_id: int) -> float:
        rt = self._rt.get(key_id)
        if not rt:
            return 0.0
        return max(0.0, rt.cooldown_until - time.monotonic())

    def acquire(self, category: str, allow_overflow: bool = True) -> UpstreamKey | None:
        """选择窗口用量/限额比最低的可用 Key。allow_overflow=True 时窗口打满也可兜底选中
        （宁可让上游 429 触发冷却，也不直接拒绝请求）。"""
        now = time.monotonic()
        best: UpstreamKey | None = None
        best_ratio: float | None = None
        fallback: UpstreamKey | None = None
        fallback_load: int | None = None
        for k in self._keys.values():
            if not k.enabled:
                continue
            rt = self._rt.get(k.id)
            if rt and rt.cooldown_until > now:
                continue
            limit = self.limit_for(k.type, category)
            win = self._window(k.id, category)
            load = len(win)
            if load < limit:
                ratio = load / limit if limit else 0.0
                if best_ratio is None or ratio < best_ratio:
                    best, best_ratio = k, ratio
            elif fallback_load is None or load < fallback_load:
                fallback, fallback_load = k, load
        chosen = best if best is not None else (fallback if allow_overflow else None)
        if chosen is None:
            return None
        self._window(chosen.id, category).append(time.monotonic())
        return chosen

    def acquire_by_id(self, key_id: int, category: str) -> UpstreamKey | None:
        """强制使用指定 Key（如查询其创建的视频任务），不受窗口/冷却限制，但计入窗口。"""
        k = self._keys.get(key_id)
        if k is None:
            return None
        self._window(key_id, category).append(time.monotonic())
        return k

    # ---------- 结果上报 ----------

    def report_result(self, key_id: int, status_code: int) -> None:
        if status_code < 400:
            rt = self._rt.setdefault(key_id, _KeyRuntime())
            rt.cooldown_until = 0.0
            asyncio.create_task(self._bump_counts(key_id, success=True))
        elif status_code == 429:
            rt = self._rt.setdefault(key_id, _KeyRuntime())
            rt.cooldown_until = time.monotonic() + settings.cooldown_seconds
            asyncio.create_task(self._bump_counts(key_id, success=False))
        elif status_code in (401, 403):
            # 密钥无效或无权限 → 禁用（面板可见，可手动恢复）
            k = self._keys.get(key_id)
            if k:
                k.enabled = False
                k.status = "invalid"
            asyncio.create_task(self._disable_key(key_id))
            asyncio.create_task(self._bump_counts(key_id, success=False))
        else:
            asyncio.create_task(self._bump_counts(key_id, success=False))

    async def _bump_counts(self, key_id: int, success: bool) -> None:
        col = "success_count" if success else "error_count"
        try:
            async with appdb.connect() as conn:
                await conn.execute(
                    f"UPDATE upstream_keys SET {col}={col}+1, last_used_at=? WHERE id=?",
                    (appdb.now_str(), key_id),
                )
                await conn.commit()
        except Exception:
            pass

    async def _disable_key(self, key_id: int) -> None:
        try:
            async with appdb.connect() as conn:
                await conn.execute("UPDATE upstream_keys SET enabled=0, status='invalid' WHERE id=?", (key_id,))
                await conn.commit()
        except Exception:
            pass

    # ---------- CRUD ----------

    async def add_keys(self, raw_keys: list[str], key_type: str = "free") -> tuple[int, int]:
        """批量添加（去重：输入内部去重 + 与库内去重）。返回 (added, skipped)。"""
        seen: set[str] = set()
        candidates: list[str] = []
        for k in raw_keys:
            k = k.strip()
            if k and k not in seen:
                seen.add(k)
                candidates.append(k)
        added = 0
        async with appdb.connect() as conn:
            existing = {r[0] for r in await (await conn.execute("SELECT key FROM upstream_keys")).fetchall()}
            cur = await conn.execute("SELECT COALESCE(MAX(id),0) FROM upstream_keys")
            seq = int((await cur.fetchone())[0])
            for k in candidates:
                if k in existing:
                    continue
                seq += 1
                await conn.execute(
                    "INSERT INTO upstream_keys (key, name, type, enabled, status, added_at) VALUES (?,?,?,?,?,?)",
                    (k, f"key-{seq:02d}", key_type, 1, "unknown", appdb.now_str()),
                )
                existing.add(k)
                added += 1
            await conn.commit()
        await self.load()
        non_empty = sum(1 for k in raw_keys if k and k.strip())
        return added, non_empty - added

    async def update_key(self, key_id: int, fields: dict) -> None:
        sets, vals = [], []
        if "type" in fields and fields["type"] in ("free", "enterprise", "token_plan"):
            sets.append("type=?")
            vals.append(fields["type"])
        if "name" in fields and fields["name"]:
            sets.append("name=?")
            vals.append(str(fields["name"]).strip())
        if "enabled" in fields:
            sets.append("enabled=?")
            vals.append(1 if fields["enabled"] else 0)
            if fields["enabled"]:
                sets.append("status='unknown'")
        if sets:
            async with appdb.connect() as conn:
                await conn.execute(f"UPDATE upstream_keys SET {', '.join(sets)} WHERE id=?", (*vals, key_id))
                await conn.commit()
        await self.reload_key(key_id)

    async def delete_key(self, key_id: int) -> None:
        async with appdb.connect() as conn:
            await conn.execute("DELETE FROM upstream_keys WHERE id=?", (key_id,))
            await conn.commit()
        self._keys.pop(key_id, None)
        self._rt.pop(key_id, None)

    async def validate(self, key_id: int) -> bool:
        """用该 Key 调一次 /v1/models 验证连通性。"""
        k = self._keys.get(key_id)
        if not k:
            return False
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(f"{settings.base_url}/v1/models",
                                        headers={"Authorization": f"Bearer {k.key}"})
        except Exception:
            self._keys[key_id].status = "unknown"
            await self.reload_key(key_id)
            return False
        valid = resp.status_code == 200
        async with appdb.connect() as conn:
            await conn.execute("UPDATE upstream_keys SET status=? WHERE id=?",
                               ("valid" if valid else "invalid", key_id))
            await conn.commit()
        await self.reload_key(key_id)
        return valid

    # ---------- 视图 ----------

    def list_status(self, db_rows: dict) -> list[dict]:
        out = []
        for k in self._keys.values():
            row = db_rows.get(k.id, {})
            limits = {cat: self.limit_for(k.type, cat) for cat in ("text", "image", "video")}
            out.append({
                "id": k.id, "name": k.name, "masked": k.key[:5] + "…" + k.key[-4:],
                "type": k.type, "enabled": k.enabled, "status": k.status,
                "rpm_used": {cat: self.rpm_used(k.id, cat) for cat in ("text", "image", "video")},
                "rpm_limit": limits,
                "cooldown_seconds": round(self.cooldown_remaining(k.id)),
                "success_count": int(row.get("success_count", 0)),
                "error_count": int(row.get("error_count", 0)),
                "last_used_at": row.get("last_used_at"),
            })
        out.sort(key=lambda x: x["id"])
        return out


def parse_keys_text(text: str) -> list[str]:
    """从粘贴文本或密钥文件内容提取密钥：优先 sk- 开头的 token，否则退回非空行。"""
    keys = re.findall(r"sk-[A-Za-z0-9_\-]+", text)
    if keys:
        return keys
    return [ln.strip() for ln in text.splitlines() if ln.strip()]


pool = KeyPool()
