"""图像端点：/v1/images/generations，完整支持文生图 / 图生图 / 多图合成三种工作流。"""
from fastapi import APIRouter, Request

from app.proxy import proxy_request

router = APIRouter()


@router.post("/v1/images/generations")
async def images_generations(request: Request):
    return await proxy_request(request, path="v1/images/generations", category="image")
