"""转发引擎：网关请求 → 鉴权 → 选上游 Key → 重试/故障转移 → 流式/非流式响应 + 计量。

转发原则：请求体完整透传、不裁剪字段，保证文档支持的所有模式（工具调用、Thinking、
多模态输入、图像三工作流、视频三模式）开箱可用；显式路由仅用于限流分类与计量。
"""
from __future__ import annotations

import asyncio
import json
import time

import httpx
from fastapi import Request, Response
from fastapi.responses import JSONResponse, StreamingResponse

from . import gateway_keys as gw
from . import keypool
from . import media
from . import stats
from . import videotasks
from .classify import classify_path
from .config import settings
from .pricing import extract_text_usage, image_cost, text_cost, video_cost

# 网络层错误统一按 599 记入 Key 错误计数
UPSTREAM_RETRYABLE = {500, 502, 503, 504, 520, 522, 524}

ANTHROPIC_ERROR_TYPES = {
    401: "authentication_error",
    403: "permission_error",
    404: "not_found_error",
    429: "rate_limit_error",
}

client = httpx.AsyncClient(
    base_url=settings.base_url,
    limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
)


def _timeout_for(category: str) -> httpx.Timeout:
    read = float(settings.timeouts.get(category, 300))
    return httpx.Timeout(connect=10.0, read=read, write=60.0, pool=30.0)


def error_response(status: int, message: str, err_type: str = "invalid_request_error",
                   code: str | None = None, style: str = "openai") -> JSONResponse:
    if style == "anthropic":
        payload = {"type": "error",
                   "error": {"type": ANTHROPIC_ERROR_TYPES.get(status, "invalid_request_error"), "message": message}}
    else:
        payload = {"error": {"message": message, "type": err_type, "code": code}}
    return JSONResponse(status_code=status, content=payload)


def _upstream_headers(request: Request, key: str, anthropic: bool = False) -> dict:
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    if anthropic:
        headers["x-api-key"] = key
        version = request.headers.get("anthropic-version")
        if version:
            headers["anthropic-version"] = version
    return headers


class _SSEUsage:
    """从透传的 SSE 流中提取 usage（兼容 OpenAI 与 Anthropic 事件格式），并累计内容字符数用于估算。"""

    def __init__(self) -> None:
        self.prompt_tokens: int | None = None
        self.completion_tokens: int | None = None
        self.content_chars = 0
        self.completed = False
        self._event = ""
        self._data: list[str] = []

    def feed_line(self, line: str) -> None:
        if line.startswith("event:"):
            self._event = line[6:].strip()
        elif line.startswith("data:"):
            self._data.append(line[5:].strip())
        elif not line.strip():
            self._flush()

    def _flush(self) -> None:
        if not self._data:
            self._event = ""
            return
        data = "\n".join(self._data)
        self._data = []
        event = self._event
        self._event = ""
        if data == "[DONE]":
            self.completed = True
            return
        try:
            obj = json.loads(data)
        except ValueError:
            return
        if not isinstance(obj, dict):
            return
        usage = obj.get("usage")
        if isinstance(usage, dict):
            p = usage.get("prompt_tokens", usage.get("input_tokens"))
            c = usage.get("completion_tokens", usage.get("output_tokens"))
            if isinstance(p, (int, float)):
                self.prompt_tokens = int(p)
            if isinstance(c, (int, float)):
                self.completion_tokens = int(c)
        for ch in obj.get("choices") or []:
            delta = (ch or {}).get("delta") or {}
            if isinstance(delta.get("content"), str):
                self.content_chars += len(delta["content"])
        et = obj.get("type") or event
        if et in ("message_stop", "response.completed"):
            self.completed = True
        if et == "message_start":
            u = (obj.get("message") or {}).get("usage") or {}
            if isinstance(u.get("input_tokens"), (int, float)):
                self.prompt_tokens = int(u["input_tokens"])
        elif et in ("message_delta", "content_block_delta"):
            u = obj.get("usage") or {}
            if isinstance(u.get("output_tokens"), (int, float)):
                self.completion_tokens = int(u["output_tokens"])
            d = obj.get("delta") or {}
            if isinstance(d.get("text"), str):
                self.content_chars += len(d["text"])


def _passthrough_payload(status: int, body: bytes, ctype: str | None) -> Response:
    if ctype and "json" in ctype and body:
        try:
            return JSONResponse(status_code=status, content=json.loads(body))
        except ValueError:
            pass
    return Response(content=body or b"", status_code=status, media_type=ctype or "text/plain")


async def proxy_request(request: Request, *, path: str, category: str | None = None,
                        error_style: str = "openai") -> Response:
    """主转发入口（POST 为主，兜底路由复用）。"""
    category = category or classify_path(path)
    raw_body = await request.body()
    parsed: dict = {}
    if raw_body:
        try:
            loaded = json.loads(raw_body)
            if isinstance(loaded, dict):
                parsed = loaded
        except ValueError:
            pass

    requested_model = parsed.get("model")
    model = None
    if requested_model:
        model = settings.model_aliases.get(str(requested_model), str(requested_model))

    start = time.monotonic()
    try:
        ctx = await gw.admit(request.headers.get("authorization", ""), category, model)
    except gw.GatewayAuthError as e:
        await stats.record(api_key_id=None, endpoint=path, category=category, model=requested_model,
                           upstream_key_id=None, status=e.status, latency_ms=0, error=e.message)
        return error_response(e.status, e.message, e.err_type, e.code, error_style)

    chain: list[str | None] = [model] if model else [None]
    if model:
        for alt in settings.failover.get(str(model), []):
            if alt not in chain:
                chain.append(alt)

    current = chain[0]
    attempts_left = max(1, settings.max_retries)
    backoff = settings.retry_backoff
    body = raw_body

    async def local_error(status: int, message: str, err_type: str, code: str,
                          entry_id: int | None = None) -> Response:
        await stats.record(api_key_id=ctx.id, endpoint=path, category=category, model=current,
                           upstream_key_id=entry_id, status=status,
                           latency_ms=int((time.monotonic() - start) * 1000), error=message)
        return error_response(status, message, err_type, code, error_style)

    async def passthrough_error(status: int, err_body: bytes, ctype: str | None, entry_id: int | None) -> Response:
        latency = int((time.monotonic() - start) * 1000)
        err_text = err_body[:300].decode("utf-8", "replace") if err_body else "upstream error"
        await stats.record(api_key_id=ctx.id, endpoint=path, category=category, model=current,
                           upstream_key_id=entry_id, status=status, latency_ms=latency, error=err_text)
        return _passthrough_payload(status, err_body, ctype)

    while True:
        entry = keypool.pool.acquire(category)
        if entry is None:
            return await local_error(429, "上游密钥池暂无可用密钥（全部冷却、禁用或尚未配置）",
                                     "rate_limit_error", "pool_exhausted")

        if current and parsed.get("model") != current:
            parsed["model"] = current
            body = json.dumps(parsed, ensure_ascii=False).encode("utf-8")

        url = "/" + path + (("?" + request.url.query) if request.url.query else "")
        req = client.build_request(
            request.method, url,
            content=body if body else None,
            headers=_upstream_headers(request, entry.key, anthropic=(path == "v1/messages")),
            timeout=_timeout_for(category),
        )
        try:
            resp = await client.send(req, stream=True)
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            keypool.pool.report_result(entry.id, 599)
            attempts_left -= 1
            if attempts_left <= 0:
                return await local_error(504, f"上游请求失败：{exc.__class__.__name__}: {exc}",
                                         "timeout", "upstream_error", entry.id)
            await asyncio.sleep(backoff)
            backoff *= 2
            continue

        status = resp.status_code
        if status < 400:
            keypool.pool.report_result(entry.id, status)
            return await _respond(request, resp, parsed=parsed, ctx=ctx, entry_id=entry.id, path=path,
                                  category=category, start=start)

        err_body = await resp.aread()
        await resp.aclose()
        keypool.pool.report_result(entry.id, status)
        ctype = resp.headers.get("content-type", "")

        if status == 429 or status in UPSTREAM_RETRYABLE or status == 401:
            attempts_left -= 1
            if attempts_left <= 0:
                return await passthrough_error(status, err_body, ctype, entry.id)
            if status != 401:
                await asyncio.sleep(backoff)
                backoff *= 2
            continue

        if status in (402, 403, 404) and current in chain:
            idx = chain.index(current)
            if idx + 1 < len(chain):
                current = chain[idx + 1]
                attempts_left = max(1, settings.max_retries)
                continue

        return await passthrough_error(status, err_body, ctype, entry.id)


async def _respond(request: Request, resp: httpx.Response, *, parsed: dict, ctx: gw.GatewayKeyContext,
                   entry_id: int, path: str, category: str, start: float) -> Response:
    """上游 2xx 响应：流式透传或非流式转发，并完成计量。"""
    ctype = resp.headers.get("content-type", "")
    model = parsed.get("model")

    if "text/event-stream" in ctype:
        return await _respond_stream(resp, parsed=parsed, ctx=ctx, entry_id=entry_id, path=path,
                                     category=category, start=start)

    body_bytes = await resp.aread()
    await resp.aclose()
    latency = int((time.monotonic() - start) * 1000)
    data = None
    try:
        data = json.loads(body_bytes)
    except ValueError:
        pass

    pt = ct = None
    cost = 0.0
    extra: dict = {}
    if category == "text" and isinstance(data, dict):
        usage = data.get("usage") or {}
        pt, ct = extract_text_usage(usage)
        details = usage.get("prompt_tokens_details") or {}
        cost = text_cost(model, pt, ct, details.get("cached_tokens"))
    elif category == "image" and isinstance(data, dict):
        count = len(data.get("data") or [])
        refs = parsed.get("extra_body", {}).get("image")
        ref_count = len(refs) if isinstance(refs, list) else (1 if refs else 0)
        size = str(parsed.get("size") or "1K")
        cost = image_cost(model, size, count, ref_count)
        extra = {"image_count": count, "image_size": size}
        if 200 <= resp.status_code < 300:
            await media.capture_images(data, parsed, api_key_id=ctx.id, upstream_key_id=entry_id)
    elif category == "video":
        try:
            seconds = float(parsed.get("seconds", 5) or 5)
        except (TypeError, ValueError):
            seconds = 5.0
        cost = video_cost(model, seconds)
        extra = {"video_seconds": seconds}
        # 记录任务归属：视频任务绑定创建它的上游 Key，查询时须用同一 Key
        if isinstance(data, dict) and data.get("video_id"):
            video_id = str(data["video_id"])
            await videotasks.remember(video_id, entry_id, api_key_id=ctx.id, metadata=parsed)
            if 200 <= resp.status_code < 300:
                await media.capture_video(data, video_id, api_key_id=ctx.id, upstream_key_id=entry_id, model=model)

    await stats.record(api_key_id=ctx.id, endpoint=path, category=category, model=model,
                       upstream_key_id=entry_id, status=resp.status_code, latency_ms=latency,
                       prompt_tokens=pt, completion_tokens=ct, cost_yuan=cost, **extra)
    return Response(content=body_bytes, status_code=resp.status_code, media_type=ctype or "application/json")


async def _respond_stream(resp: httpx.Response, *, parsed: dict, ctx: gw.GatewayKeyContext,
                          entry_id: int, path: str, category: str, start: float) -> Response:
    usage = _SSEUsage()
    prompt_est: int | None = None
    if category == "text":
        seed = parsed.get("messages") or parsed.get("input") or ""
        prompt_est = len(json.dumps(seed, ensure_ascii=False)) // 4 or None
    state = {"completed": False}

    async def finalize():
        # 客户端断开时本协程运行在被取消的 anyio 作用域内，任何 await 都会立刻失败；
        # 因此收尾放在独立任务中执行，保证断连场景下计量不丢失。
        try:
            await resp.aclose()
        except Exception:
            pass
        latency = int((time.monotonic() - start) * 1000)
        pt, ct = usage.prompt_tokens, usage.completion_tokens
        cost = 0.0
        if category == "text":
            if pt is None:
                pt = prompt_est
            if ct is None and usage.content_chars:
                ct = usage.content_chars // 4 or None
            cost = text_cost(parsed.get("model"), pt, ct)
        await stats.record(api_key_id=ctx.id, endpoint=path, category=category, model=parsed.get("model"),
                           upstream_key_id=entry_id, status=200, latency_ms=latency, stream=True,
                           prompt_tokens=pt, completion_tokens=ct, cost_yuan=cost,
                           error=None if state["completed"] or usage.completed else "client_disconnected")

    async def gen():
        buf = ""
        try:
            async for chunk in resp.aiter_bytes():
                buf += chunk.decode("utf-8", "replace")
                *lines, buf = buf.split("\n")
                for line in lines:
                    usage.feed_line(line.strip("\r"))
                # Observe terminal events before handing them to the client:
                # it may close immediately after receiving a complete reply.
                yield chunk
            if buf:
                usage.feed_line(buf)
            state["completed"] = True
        finally:
            asyncio.get_running_loop().create_task(finalize())

    return StreamingResponse(
        gen(),
        status_code=resp.status_code,
        media_type=resp.headers.get("content-type", "text/event-stream"),
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def proxy_get(request: Request, *, path: str, category: str, params: dict | None = None,
                    model_for_auth: str | None = None, force_key_id: int | None = None) -> Response:
    """无请求体的 GET 转发（/v1/models、视频任务查询）。"""
    start = time.monotonic()
    if category == "video" and not model_for_auth:
        model_for_auth = (params or {}).get("model_name")
        if not model_for_auth:
            task = await videotasks.details(str((params or {}).get("video_id") or ""))
            model_for_auth = task.get("metadata", {}).get("model")
    try:
        ctx = await gw.admit(request.headers.get("authorization", ""), category, model_for_auth)
    except gw.GatewayAuthError as e:
        await stats.record(api_key_id=None, endpoint=path, category=category, model=model_for_auth,
                           upstream_key_id=None, status=e.status, latency_ms=0, error=e.message)
        return error_response(e.status, e.message, e.err_type, e.code)

    entry = None
    if force_key_id is not None:
        entry = keypool.pool.acquire_by_id(force_key_id, category)
    if entry is None:
        entry = keypool.pool.acquire(category)
    if entry is None:
        await stats.record(api_key_id=ctx.id, endpoint=path, category=category, model=model_for_auth,
                           upstream_key_id=None, status=429, latency_ms=int((time.monotonic() - start) * 1000),
                           error="上游密钥池暂无可用密钥（全部冷却、禁用或尚未配置）")
        return error_response(429, "上游密钥池暂无可用密钥（全部冷却、禁用或尚未配置）",
                              "rate_limit_error", "pool_exhausted")
    try:
        resp = await client.get("/" + path, params=params,
                                headers=_upstream_headers(request, entry.key), timeout=_timeout_for(category))
    except (httpx.TimeoutException, httpx.TransportError) as exc:
        keypool.pool.report_result(entry.id, 599)
        message = f"上游请求失败：{exc.__class__.__name__}: {exc}"
        await stats.record(api_key_id=ctx.id, endpoint=path, category=category, model=model_for_auth,
                           upstream_key_id=entry.id, status=504,
                           latency_ms=int((time.monotonic() - start) * 1000), error=message)
        return error_response(504, message, "timeout", "upstream_error")

    keypool.pool.report_result(entry.id, resp.status_code)
    if category == "video" and 200 <= resp.status_code < 300:
        try:
            data = resp.json()
        except ValueError:
            data = None
        if isinstance(data, dict):
            video_id = str((params or {}).get("video_id") or data.get("video_id") or "")
            await media.capture_video(data, video_id, api_key_id=ctx.id, upstream_key_id=entry.id,
                                      model=model_for_auth)
    latency = int((time.monotonic() - start) * 1000)
    await stats.record(api_key_id=ctx.id, endpoint=path, category=category, model=model_for_auth,
                       upstream_key_id=entry.id, status=resp.status_code, latency_ms=latency,
                       error=resp.text[:300] if resp.status_code >= 400 else None)
    return Response(content=resp.content, status_code=resp.status_code,
                    media_type=resp.headers.get("content-type", "application/json"))
