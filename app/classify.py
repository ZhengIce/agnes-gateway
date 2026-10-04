"""端点 → 请求类别（text/image/video）映射，用于限流、超时与计价。"""
from __future__ import annotations

CATEGORIES = ("text", "image", "video")


def classify_path(path: str) -> str:
    p = path.strip("/")
    if p.startswith("images"):
        return "image"
    if p.startswith("videos") or p == "agnesapi":
        return "video"
    return "text"
