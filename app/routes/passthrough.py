"""兜底透传：未显式路由的 /v1/* 端点原样转发（未来新增端点零改动即用）。"""
from fastapi import APIRouter, Request

from app.proxy import proxy_request

router = APIRouter()


@router.api_route("/v1/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def v1_passthrough(request: Request, path: str):
    return await proxy_request(request, path=path)
