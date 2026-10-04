"""计价与成本计算（¥）。价格表来自 config.yaml 的 pricing 段（默认官方现价）。"""
from __future__ import annotations

from typing import Any

from .config import settings


def extract_text_usage(usage: dict | None) -> tuple[int | None, int | None]:
    """从 usage 对象提取 (prompt_tokens, completion_tokens)，兼容 OpenAI 与 Responses/Anthropic 字段名。"""
    if not isinstance(usage, dict):
        return None, None
    prompt = usage.get("prompt_tokens", usage.get("input_tokens"))
    completion = usage.get("completion_tokens", usage.get("output_tokens"))
    return (
        int(prompt) if isinstance(prompt, (int, float)) else None,
        int(completion) if isinstance(completion, (int, float)) else None,
    )


def text_cost(model: str | None, prompt_tokens: int | None, completion_tokens: int | None, cached_tokens: int | None = None) -> float:
    table = settings.pricing.get("text", {}).get(model or "")
    if not table:
        return 0.0
    pt = prompt_tokens or 0
    ct = completion_tokens or 0
    cached = min(cached_tokens or 0, pt)
    normal_input = pt - cached
    cost = normal_input / 1e6 * table.get("input", 0)
    cost += cached / 1e6 * table.get("cached_input", 0)
    cost += ct / 1e6 * table.get("output", 0)
    return round(cost, 6)


def image_cost(model: str | None, size: str | None, image_count: int, ref_count: int) -> float:
    cfg = settings.pricing.get("image", {})
    if model not in (cfg.get("models") or []):
        return 0.0
    per_image = cfg.get("per_image") or {}
    unit = float(per_image.get(str(size or "1K").upper(), per_image.get("1K", 0)))
    free_refs = int(cfg.get("free_references", 3))
    extra = max(0, ref_count - free_refs) * float(cfg.get("extra_reference", 0))
    return round(image_count * unit + extra, 6)


def video_cost(model: str | None, seconds: float) -> float:
    cfg = settings.pricing.get("video", {})
    if model not in (cfg.get("models") or []):
        return 0.0
    per_second = cfg.get("per_second") or {}
    unit = float(per_second.get("720P", 0))
    return round(max(0.0, seconds) * unit, 6)


def usage_from_response(data: Any) -> dict:
    """从上游响应中提取 token 用量。"""
    if isinstance(data, dict):
        return data.get("usage") or {}
    return {}
