"""视频端点：任务创建（POST /v1/videos）与查询规范化（GET /v1/videos/{id} → 上游 /agnesapi），
同时保留 /agnesapi 原样透传。视频任务绑定创建它的上游 Key，查询强制复用。"""
from fastapi import APIRouter, Request

from app import videotasks
from app.proxy import proxy_get, proxy_request

router = APIRouter()


@router.post("/v1/videos")
async def create_video(request: Request):
    # text / keyframe（首尾帧）/ reference（参考图/音频）三种模式由请求体 mode 区分，完整透传
    return await proxy_request(request, path="v1/videos", category="video")


@router.get("/v1/videos/{video_id}")
async def video_status(request: Request, video_id: str, model_name: str | None = None):
    """规范化查询：推荐 video_id + model_name（全模式支持）。"""
    params = {"video_id": video_id}
    if model_name:
        params["model_name"] = model_name
    owner = await videotasks.lookup(video_id)
    return await proxy_get(request, path="agnesapi", category="video", params=params,
                           model_for_auth=model_name, force_key_id=owner)


@router.get("/agnesapi")
async def agnesapi_raw(request: Request):
    """上游查询接口原样透传（兼容仅 video_id 的 text 模式查询）。"""
    params = {k: v for k, v in request.query_params.items()}
    owner = await videotasks.lookup(params.get("video_id", ""))
    return await proxy_get(request, path="agnesapi", category="video", params=params, force_key_id=owner)
