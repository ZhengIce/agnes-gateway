"""Public model descriptions and verified reference prices, plus live discovery.

Pricing is a dated official snapshot, not the gateway's editable cost estimate.
Never infer an unpublished model's price from another model's name.
"""
from __future__ import annotations

import asyncio
import copy
import time
from datetime import datetime, timezone

import httpx

from . import keypool
from .config import settings

VERIFIED_ON = "2026-10-05"
DOCS = "https://wiki.agnes-ai.cn/zh-Hans/docs/"
PRICING_SOURCE = DOCS + "pricing"


def price(label, amount, unit, original=None):
    return {"label": label, "amount": amount, "unit": unit, "original": original}


TEXT_FREE = [
    price("输入", 0, "百万 Token", 0.35),
    price("缓存命中", 0, "百万 Token", 0.035),
    price("输出", 0, "百万 Token", 1),
]
TEXT_PRO = [price("输入", 3, "百万 Token"), price("缓存命中", 0.3, "百万 Token"), price("输出", 6, "百万 Token")]
IMAGE_FREE = [
    price(size, 0, "张", original)
    for size, original in [("1K", 0.07), ("2K", 0.12), ("3K", 0.14), ("4K", 0.16)]
] + [price("第 4 张起参考图", 0, "张", 0.02)]
VIDEO_PAID = [
    price("720P", 0.15, "秒"), price("1080P / 1K", 0.25, "秒"),
    price("2K", 0.35, "秒"), price("第 6 张起参考图", 0.03, "张"),
]

CATALOG = [
    {
        "id": "agnes-3.0-flash", "name": "Agnes 3.0 Flash", "kind": "text",
        "description": "通用文本与多模态理解模型，支持对话、内容创作、编码和推理任务。",
        "features": ["多模态理解", "流式回复", "工具调用"],
        "prices": TEXT_FREE, "promotion": True, "doc": DOCS + "agnes-30-flash",
    },
    {
        "id": "agnes-2.5-flash", "name": "Agnes 2.5 Flash", "kind": "text",
        "description": "面向日常对话、代码辅助和图文理解，支持多轮交流与流式输出。",
        "features": ["多轮对话", "图文理解", "工具调用"],
        "prices": TEXT_FREE, "promotion": True, "doc": DOCS + "agnes-25-flash",
    },
    {
        "id": "agnes-2.5-pro", "name": "Agnes 2.5 Pro", "kind": "text",
        "description": "面向高级编码、科学推理、长上下文分析和智能体工作流的商业化稳定模型。",
        "features": ["复杂推理", "长上下文分析", "多模态理解"],
        "prices": TEXT_PRO, "doc": DOCS + "agnes-25-pro",
    },
    {
        "id": "agnes-3.0-pro", "name": "Agnes 3.0 Pro", "kind": "text",
        "description": "即将上线的新一代 Pro 模型，面向智能体工作、专业文档分析、科学编码与长上下文推理。",
        "features": ["专业文档分析", "科学编码", "长上下文推理"],
        "prices": TEXT_PRO, "upcoming": True, "doc": DOCS + "agnes-30-pro",
    },
    *[
        {
            "id": f"agnes-image-{version}-flash", "name": f"Agnes Image {version} Flash", "kind": "image",
            "description": "支持从文字生成图片、基于原图编辑，以及组合多张参考图片进行创作。",
            "features": ["文生图", "图生图", "多图参考", "1K–4K"],
            "prices": IMAGE_FREE, "promotion": True, "doc": DOCS + f"agnes-image-{version.replace('.', '')}-flash",
            "price_note": "当前输出图片与输入参考图均免费；优惠可能调整。",
        }
        for version in ("2.5", "2.1", "2.0")
    ],
    {
        "id": "agnes-video-2.5-flash", "name": "Agnes Video 2.5 Flash", "kind": "video",
        "description": "支持文生视频、首尾帧控制，以及图片和音频参考生成；输出为 720P。",
        "features": ["首尾帧控制", "图片 / 音频参考", "720P", "4–12 秒"],
        "prices": [price("720P", 0, "秒", 0.15)], "promotion": True,
        "doc": DOCS + "agnes-video-25-flash",
        "price_note": "当前限时免费，最多 5 张参考图片和 3 段参考音频。",
    },
    {
        "id": "agnes-video-2.5", "name": "Agnes Video 2.5", "kind": "video",
        "description": "支持文生视频、首尾帧与图片、音频、视频参考，适用于需要更多分辨率选择的视频创作。",
        "features": ["首尾帧控制", "多模态参考", "720P–2K", "4–12 秒"],
        "prices": VIDEO_PAID, "doc": DOCS + "agnes-video-25",
        "price_note": "按输出与输入视频的合计秒数计费；前 5 张参考图片免费。",
    },
]


def merge_catalog(discovered: list[dict]) -> list[dict]:
    models = {item["id"]: copy.deepcopy(item) for item in CATALOG}
    for item in discovered:
        model_id = item.get("id") if isinstance(item, dict) else None
        if not isinstance(model_id, str) or not model_id.strip():
            continue
        if model_id not in models:
            kind = "image" if "image" in model_id.lower() else "video" if "video" in model_id.lower() else "text"
            models[model_id] = {
                "id": model_id, "name": model_id, "kind": kind,
                "description": "上游模型目录返回的型号，暂无已核实的独立介绍与详细规格。",
                "features": [], "prices": [], "doc": None,
            }
        models[model_id]["listed_upstream"] = True
        # A released model appearing in the live catalog supersedes a snapshot's
        # "coming soon" label, without making promises about key permissions.
        models[model_id]["upcoming"] = False
    return list(models.values())


_cache = None
_cache_at = 0.0
_cache_url = ""
_lock = asyncio.Lock()


async def catalog(refresh: bool = False) -> dict:
    global _cache, _cache_at, _cache_url
    async with _lock:
        if _cache is not None and _cache_url == settings.base_url and time.monotonic() - _cache_at < (10 if refresh else 300):
            return _cache
        warning = ""
        discovered = []
        entry = keypool.pool.acquire("text", allow_overflow=False)
        if entry is None:
            warning = "暂时没有可用于刷新目录的上游密钥，先展示已有模型信息。"
        else:
            try:
                async with httpx.AsyncClient(timeout=15) as client:
                    response = await client.get(f"{settings.base_url}/v1/models", headers={"Authorization": f"Bearer {entry.key}"})
                    response.raise_for_status()
                    payload = response.json()
                if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
                    raise ValueError("invalid model list")
                discovered = payload["data"]
                if not discovered:
                    warning = "上游返回了空目录，先展示已有模型信息。"
            except httpx.HTTPStatusError as exc:
                warning = f"模型目录刷新失败（HTTP {exc.response.status_code}），先展示已有模型信息。"
            except (httpx.HTTPError, ValueError):
                warning = "暂时无法读取上游模型目录，先展示已有模型信息。"
        cached = _cache if _cache_url == settings.base_url else None
        result = {
            "models": cached["models"] if warning and cached else merge_catalog(discovered),
            "warning": warning, "pricing_verified_on": VERIFIED_ON,
            "pricing_source": PRICING_SOURCE,
            "synced_at": cached["synced_at"] if warning and cached else None if warning else datetime.now(timezone.utc).isoformat(),
        }
        _cache, _cache_at, _cache_url = result, time.monotonic(), settings.base_url
        return result
