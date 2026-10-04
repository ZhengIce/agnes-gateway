import asyncio
from types import SimpleNamespace

import httpx
import pytest

from app import model_catalog
from app.config import settings
from app.main import app


def test_catalog_keeps_paid_prices_and_does_not_guess_unknown_models():
    models = {item["id"]: item for item in model_catalog.merge_catalog([
        {"id": "agnes-2.5-pro-alpha"}, {"id": "agnes-3.0-flash"},
        {"id": "agnes-video-v2.0"}, {"id": "agnes-image-new"}, {"id": None},
    ])}
    assert models["agnes-2.5-pro"]["prices"][0]["amount"] == 3
    assert models["agnes-video-2.5"]["prices"][0]["amount"] == 0.15
    assert models["agnes-video-2.5-flash"]["prices"][0]["amount"] == 0
    assert models["agnes-2.5-pro-alpha"]["prices"] == []
    assert models["agnes-video-v2.0"]["kind"] == "video"
    assert models["agnes-image-new"]["kind"] == "image"
    assert models["agnes-3.0-flash"]["listed_upstream"]
    assert models["agnes-3.0-pro"]["upcoming"]
    assert len(models) == 12


async def test_admin_catalog_requires_authentication(monkeypatch):
    monkeypatch.setattr(settings, "admin_token", "test-admin")
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.get("/admin/api/models")).status_code == 401


async def test_catalog_caches_discovery_and_keeps_previous_result_on_failure(monkeypatch):
    monkeypatch.setattr(model_catalog, "_cache", None)
    monkeypatch.setattr(model_catalog, "_cache_at", 0)
    monkeypatch.setattr(model_catalog, "_cache_url", "")
    monkeypatch.setattr(model_catalog, "_lock", asyncio.Lock())
    monkeypatch.setattr(settings, "base_url", "https://upstream.test")
    monkeypatch.setattr(model_catalog.keypool.pool, "acquire", lambda *args, **kwargs: SimpleNamespace(key="sk-private-test"))
    calls = []
    fail = False

    def upstream(request):
        calls.append(request)
        return httpx.Response(503, json={"error": "sk-private-test"}) if fail else httpx.Response(200, json={
            "data": [{"id": "agnes-video-v2.0"}, {"id": "agnes-3.0-flash"}],
        })

    async with httpx.AsyncClient(transport=httpx.MockTransport(upstream)) as client:
        class ClientContext:
            async def __aenter__(self):
                return client

            async def __aexit__(self, *args):
                return None

        monkeypatch.setattr(model_catalog.httpx, "AsyncClient", lambda **kwargs: ClientContext())
        first = await model_catalog.catalog()
        assert first["warning"] == ""
        assert first["synced_at"]
        assert any(model["id"] == "agnes-video-v2.0" for model in first["models"])
        assert await model_catalog.catalog(refresh=True) is first
        assert len(calls) == 1
        fail = True
        model_catalog._cache_at = 0
        failed = await model_catalog.catalog(refresh=True)
        assert "503" in failed["warning"]
        assert "sk-private-test" not in str(failed)
        assert failed["models"] == first["models"]
        assert failed["synced_at"] == first["synced_at"]
        assert len(calls) == 2
