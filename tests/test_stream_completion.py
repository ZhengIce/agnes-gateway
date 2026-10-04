import asyncio
import time
from types import SimpleNamespace

import httpx
import pytest

from app import proxy


class Stream(httpx.AsyncByteStream):
    def __init__(self, chunks):
        self.chunks = chunks

    async def __aiter__(self):
        for chunk in self.chunks:
            yield chunk


@pytest.mark.parametrize("terminal", [
    b"data: [DONE]\n\n",
    b'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    b'event: response.completed\ndata: {"type":"response.completed"}\n\n',
    None,
])
async def test_client_closing_after_terminal_event_is_not_a_disconnect(monkeypatch, terminal):
    recorded = []
    finalized = asyncio.Event()

    async def record(**fields):
        recorded.append(fields)
        finalized.set()

    monkeypatch.setattr(proxy.stats, "record", record)
    content = b'data: {"choices":[{"delta":{"content":"hello"}}],"usage":{"prompt_tokens":130,"completion_tokens":19}}\n\n'
    # Split the terminal event to cover network chunk boundaries.
    chunks = [content] + ([terminal[:8], terminal[8:]] if terminal else [])
    upstream = httpx.Response(200, headers={"content-type": "text/event-stream"}, stream=Stream(chunks))
    response = await proxy._respond_stream(
        upstream, parsed={"model": "agnes-3.0-flash"},
        ctx=SimpleNamespace(id=1), entry_id=1, path="v1/chat/completions",
        category="text", start=time.monotonic(),
    )
    iterator = response.body_iterator
    for chunk in chunks:
        assert await anext(iterator) == chunk
    # Close before the iterator reaches transport EOF, as the frontend does.
    await iterator.aclose()
    await asyncio.wait_for(finalized.wait(), timeout=1)
    assert recorded[0]["error"] == (None if terminal else "client_disconnected")
    assert recorded[0]["status"] == 200
    assert recorded[0]["prompt_tokens"] == 130
    assert recorded[0]["completion_tokens"] == 19
    assert upstream.is_closed
