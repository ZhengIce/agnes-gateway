"""Anthropic 兼容端点：/v1/messages（原生透传，错误响应使用 Anthropic 形状）。"""
from fastapi import APIRouter, Request

from app.proxy import proxy_request

router = APIRouter()


@router.post("/v1/messages")
async def messages(request: Request):
    return await proxy_request(request, path="v1/messages", error_style="anthropic")
