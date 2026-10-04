"""OpenAI 兼容文本端点：Chat Completions / Responses / Models。"""
from fastapi import APIRouter, Request

from app.proxy import proxy_get, proxy_request

router = APIRouter()


@router.post("/v1/chat/completions")
async def chat_completions(request: Request):
    return await proxy_request(request, path="v1/chat/completions")


@router.post("/v1/responses")
async def responses_api(request: Request):
    return await proxy_request(request, path="v1/responses")


@router.get("/v1/models")
async def list_models(request: Request):
    return await proxy_get(request, path="v1/models", category="text")
