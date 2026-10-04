import json
import sqlite3
from types import SimpleNamespace

import httpx
import pytest

from app import db as appdb
from app import gateway_keys as gw
from app import keypool, proxy
from app.config import settings
from app.main import app


ADMIN = {"X-Admin-Token": "test-admin"}
IMAGE_MODEL = "agnes-image-2.5-flash"
VIDEO_MODEL = "agnes-video-2.5-flash"


@pytest.fixture
async def library(monkeypatch, tmp_path):
    monkeypatch.setattr(appdb, "DB_PATH", tmp_path / "library.db")
    monkeypatch.setattr(settings, "admin_token", "test-admin")
    await appdb.init_db()
    gw._windows.clear()
    pool = keypool.KeyPool()
    await pool.add_keys(["sk-library-1", "sk-library-2"])
    # Key health counters are unrelated background writes; keep actual selection.
    monkeypatch.setattr(pool, "report_result", lambda *_: None)
    monkeypatch.setattr(keypool, "pool", pool)
    token = await gw.create_key("library-client", rpm_limits={"image": 100, "video": 100})
    queue, requests = [], []

    def upstream(request):
        requests.append(request)
        assert queue, f"Unexpected upstream request: {request.url}"
        status, payload = queue.pop(0)
        return httpx.Response(status, json=payload)

    async with httpx.AsyncClient(
        base_url="https://upstream.test", transport=httpx.MockTransport(upstream)
    ) as upstream_client:
        monkeypatch.setattr(proxy, "client", upstream_client)
        async with httpx.AsyncClient(
            base_url="http://gateway.test", transport=httpx.ASGITransport(app=app)
        ) as client:
            yield SimpleNamespace(
                client=client, queue=queue, requests=requests,
                auth={"Authorization": f"Bearer {token}"}, pool=pool,
            )
    gw._windows.clear()


async def listing(library, kind, **params):
    response = await library.client.get(
        "/admin/api/media", params={"kind": kind, **params}, headers=ADMIN,
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    return response.json()


async def generate_image(library, payload, *, status=200, prompt="snowfield"):
    library.queue.append((status, payload))
    return await library.client.post(
        "/v1/images/generations", headers=library.auth,
        json={"model": IMAGE_MODEL, "prompt": prompt, "size": "2K", "ratio": "16:9"},
    )


async def create_video(library, video_id="video-library"):
    payload = {"video_id": video_id, "status": "queued"}
    library.queue.append((200, payload))
    response = await library.client.post(
        "/v1/videos", headers=library.auth,
        json={
            "model": VIDEO_MODEL, "prompt": "waves at sunset",
            "size": "720P", "aspect_ratio": "16:9", "seconds": "5",
        },
    )
    assert response.json() == payload
    return video_id


async def poll_video(library, video_id, payload, *, raw=False):
    library.queue.append((200, payload))
    if raw:
        return await library.client.get(
            "/agnesapi", params={"video_id": video_id}, headers=library.auth,
        )
    return await library.client.get(
        f"/v1/videos/{video_id}", params={"model_name": VIDEO_MODEL}, headers=library.auth,
    )


async def test_library_requires_admin(library):
    response = await library.client.get("/admin/api/media", params={"kind": "image"})
    assert response.status_code == 401
    response = await library.client.delete("/admin/api/media/1")
    assert response.status_code == 401
    response = await library.client.get(
        "/admin/api/media", params={"kind": "image"}, headers=library.auth,
    )
    assert response.status_code == 401
    response = await library.client.delete("/admin/api/media/1", headers=library.auth)
    assert response.status_code == 401


async def test_empty_library_and_query_validation(library):
    assert await listing(library, "image") == {"total": 0, "items": []}
    assert await listing(library, "video") == {"total": 0, "items": []}
    for params in (
        {"kind": "audio"}, {"kind": "image", "limit": 0},
        {"kind": "image", "limit": 101}, {"kind": "image", "offset": -1},
    ):
        response = await library.client.get("/admin/api/media", params=params, headers=ADMIN)
        assert response.status_code == 422


async def test_image_links_saved_with_metadata_and_response_unchanged(library):
    payload = {
        "created": 1780000000,
        "data": [
            {"url": "https://cdn.test/first.png?signature=abc", "b64_json": None},
            {"url": "https://cdn.test/second.png", "b64_json": "DO_NOT_STORE"},
        ],
    }
    response = await generate_image(library, payload)
    assert response.json() == payload
    images = await listing(library, "image")
    assert images["total"] == 2
    assert {item["url"] for item in images["items"]} == {
        "https://cdn.test/first.png?signature=abc", "https://cdn.test/second.png",
    }
    for item in images["items"]:
        assert item["kind"] == "image"
        assert item["prompt"] == "snowfield"
        assert item["model"] == IMAGE_MODEL
        assert item["size"] == "2K"
        assert item["ratio"] == "16:9"
        assert item["api_key_name"] == "library-client"
        assert item["created_at"]
    async with appdb.connect() as conn:
        dump = "\n".join([line async for line in conn.iterdump()])
    assert "DO_NOT_STORE" not in dump
    assert len(library.requests) == 1
    assert library.requests[0].url.path == "/v1/images/generations"
    assert (await listing(library, "video"))["total"] == 0


async def test_base64_only_response_is_not_saved(library):
    payload = {"data": [{"url": None, "b64_json": "BASE64_ONLY_OUTPUT"}]}
    response = await generate_image(library, payload)
    assert response.json() == payload
    assert (await listing(library, "image"))["total"] == 0


async def test_unsafe_urls_and_malformed_items_are_ignored(library):
    payload = {"data": [
        {"url": "data:image/png;base64,secret"},
        {"url": "javascript:alert(1)"},
        {"url": "file:///C:/image.png"},
        {"url": "https://"},
        {"url": "https://cdn.test/image\n.png"},
        {"url": "https://name:password@cdn.test/image.png"},
        {"url": 42}, None, "invalid item",
        {"url": "https://cdn.test/valid.png"},
    ]}
    response = await generate_image(library, payload)
    assert response.json() == payload
    images = await listing(library, "image")
    assert images["total"] == 1
    assert images["items"][0]["url"] == "https://cdn.test/valid.png"


async def test_unsuccessful_generation_is_not_saved(library):
    payload = {"error": {"message": "rejected"}, "data": [{"url": "https://cdn.test/no.png"}]}
    response = await generate_image(library, payload, status=400)
    assert response.status_code == 400
    assert response.json() == payload
    assert (await listing(library, "image"))["total"] == 0


async def test_redirect_response_is_not_a_completed_generation(library):
    payload = {"data": [{"url": "https://cdn.test/redirect.png"}]}
    response = await generate_image(library, payload, status=302)
    assert response.status_code == 302
    assert response.json() == payload
    assert (await listing(library, "image"))["total"] == 0


async def test_repeated_image_link_is_not_duplicated(library):
    payload = {"data": [{"url": "https://cdn.test/shared.png"}]}
    await generate_image(library, payload)
    await generate_image(library, payload)
    assert (await listing(library, "image"))["total"] == 1


async def test_video_saved_on_completion_and_signed_url_refreshed(library):
    video_id = await create_video(library)
    assert (await listing(library, "video"))["total"] == 0
    payload = {
        "id": "task-library", "status": "completed", "internal_status": "pending",
        "url": "https://cdn.test/video.mp4?signature=first", "seconds": "4", "size": "720P",
    }
    response = await poll_video(library, video_id, payload)
    assert response.json() == payload
    initial = (await listing(library, "video"))["items"][0]
    payload["url"] = "https://cdn.test/video.mp4?signature=second"
    response = await poll_video(library, video_id, payload)
    assert response.json() == payload
    videos = await listing(library, "video")
    assert videos["total"] == 1
    item = videos["items"][0]
    assert item["id"] == initial["id"]
    assert item["created_at"] == initial["created_at"]
    assert item["url"] == payload["url"]
    assert item["video_id"] == video_id
    assert item["prompt"] == "waves at sunset"
    assert item["model"] == VIDEO_MODEL
    assert item["ratio"] == "16:9"
    assert item["seconds"] == 4
    assert item["api_key_name"] == "library-client"
    assert library.requests[1].url.path == "/agnesapi"
    assert library.requests[1].url.params["video_id"] == video_id
    assert library.requests[1].headers["authorization"] == library.requests[0].headers["authorization"]


async def test_raw_video_query_also_saves_link(library):
    video_id = await create_video(library)
    payload = {"status": "completed", "url": "https://cdn.test/raw.mp4"}
    assert (await poll_video(library, video_id, payload, raw=True)).json() == payload
    item = (await listing(library, "video"))["items"][0]
    assert item["url"] == payload["url"]
    assert item["model"] == VIDEO_MODEL
    assert item["seconds"] == 5


async def test_sparse_video_refresh_preserves_actual_output_metadata(library):
    video_id = await create_video(library)
    await poll_video(library, video_id, {
        "status": "completed", "url": "https://cdn.test/full.mp4", "seconds": "4", "size": "1080P",
    })
    await poll_video(library, video_id, {
        "status": "completed", "url": "https://cdn.test/full.mp4?refreshed=1",
    })
    item = (await listing(library, "video"))["items"][0]
    assert item["seconds"] == 4
    assert item["size"] == "1080P"
    assert item["url"].endswith("?refreshed=1")


async def test_video_attribution_stays_with_creator_when_polled_by_other_key(library):
    video_id = await create_video(library)
    other = await gw.create_key("other-poller")
    library.queue.append((200, {"status": "completed", "url": "https://cdn.test/creator.mp4"}))
    response = await library.client.get(
        f"/v1/videos/{video_id}", headers={"Authorization": f"Bearer {other}"},
    )
    assert response.status_code == 200
    item = (await listing(library, "video"))["items"][0]
    assert item["api_key_name"] == "library-client"
    assert item["model"] == VIDEO_MODEL
    assert item["prompt"] == "waves at sunset"


async def test_immediately_completed_video_and_reference_data_not_persisted(library):
    payload = {"video_id": "video-immediate", "status": "completed", "url": "https://cdn.test/immediate.mp4"}
    library.queue.append((200, payload))
    response = await library.client.post(
        "/v1/videos", headers=library.auth,
        json={
            "model": VIDEO_MODEL, "prompt": "snow", "size": "720P", "seconds": "5",
            "images": ["data:image/png;base64,REFERENCE_NOT_STORED"],
            "audios": ["https://cdn.test/REFERENCE_AUDIO_NOT_STORED.mp3"],
        },
    )
    assert response.json() == payload
    videos = await listing(library, "video")
    assert videos["total"] == 1
    assert videos["items"][0]["prompt"] == "snow"
    async with appdb.connect() as conn:
        dump = "\n".join([line async for line in conn.iterdump()])
    assert "REFERENCE_NOT_STORED" not in dump
    assert "REFERENCE_AUDIO_NOT_STORED" not in dump


@pytest.mark.parametrize("status", ["queued", "in_progress", "failed", None])
async def test_unfinished_video_url_is_not_saved(library, status):
    video_id = await create_video(library)
    await poll_video(library, video_id, {"status": status, "url": "https://cdn.test/no.mp4"})
    assert (await listing(library, "video"))["total"] == 0


async def test_distinct_video_tasks_are_not_merged_by_url(library):
    for video_id in ("video-first", "video-second"):
        await create_video(library, video_id)
        await poll_video(library, video_id, {"status": "completed", "url": "https://cdn.test/same.mp4"})
    assert (await listing(library, "video"))["total"] == 2


async def test_delete_video_remains_deleted_after_polling(library):
    video_id = await create_video(library)
    payload = {"status": "completed", "url": "https://cdn.test/delete.mp4"}
    await poll_video(library, video_id, payload)
    item = (await listing(library, "video"))["items"][0]
    response = await library.client.delete(f"/admin/api/media/{item['id']}", headers=ADMIN)
    assert response.status_code == 200
    assert response.json() == {"ok": True}
    payload["url"] = "https://cdn.test/delete.mp4?refreshed=1"
    await poll_video(library, video_id, payload)
    assert (await listing(library, "video"))["total"] == 0
    response = await library.client.delete(f"/admin/api/media/{item['id']}", headers=ADMIN)
    assert response.status_code == 404


async def test_search_pagination_and_image_deletion(library):
    for name in ("mountain", "ocean", "forest"):
        await generate_image(library, {"data": [{"url": f"https://cdn.test/{name}.png"}]}, prompt=name)
    result = await listing(library, "image", search="ocean")
    assert result["total"] == 1
    assert result["items"][0]["prompt"] == "ocean"
    assert "sk-library" not in json.dumps(result)
    assert "ag-" not in json.dumps(result)
    page = await listing(library, "image", limit=1, offset=1)
    assert page["total"] == 3
    assert len(page["items"]) == 1
    assert page["items"][0]["prompt"] == "ocean"
    await library.client.delete(f"/admin/api/media/{page['items'][0]['id']}", headers=ADMIN)
    assert (await listing(library, "image"))["total"] == 2
    await generate_image(library, {"data": [{"url": "https://cdn.test/ocean.png"}]})
    assert (await listing(library, "image"))["total"] == 2


async def test_video_date_range_and_eight_item_pagination(library):
    timestamps = ["2026-10-01 23:59:59", "2026-10-02 00:00:00"] + [
        f"2026-10-02 12:00:0{n}" for n in range(5)
    ] + ["2026-10-02 23:59:59", "2026-10-03 00:00:00"]
    for index, timestamp in enumerate(timestamps):
        video_id = await create_video(library, f"dated-{index}")
        await poll_video(library, video_id, {"status": "completed", "url": f"https://cdn.test/video-{index}.mp4"})
        async with appdb.connect() as conn:
            await conn.execute("UPDATE media_assets SET created_at=? WHERE video_id=?", (timestamp, video_id))
            await conn.commit()
    first = await listing(library, "video", limit=100)
    assert first["total"] == 9
    assert len(first["items"]) == 8
    second = await listing(library, "video", limit=8, offset=8)
    assert len(second["items"]) == 1
    assert not ({item["id"] for item in first["items"]} & {item["id"] for item in second["items"]})
    same_day = await listing(library, "video", start_date="2026-10-02", end_date="2026-10-02")
    assert same_day["total"] == 7
    assert {item["created_at"] for item in same_day["items"]} == set(timestamps[1:-1])
    assert (await listing(library, "video", end_date="2026-10-01"))["total"] == 1
    assert (await listing(library, "video", start_date="2026-10-03"))["total"] == 1
    reversed_range = await library.client.get("/admin/api/media",
        params={"kind": "video", "start_date": "2026-10-03", "end_date": "2026-10-01"}, headers=ADMIN)
    assert reversed_range.status_code == 400
    invalid = await library.client.get("/admin/api/media",
        params={"kind": "video", "start_date": "2026-02-30"}, headers=ADMIN)
    assert invalid.status_code == 422


async def test_legacy_video_tasks_migrate_without_losing_ownership(library):
    with sqlite3.connect(appdb.DB_PATH) as conn:
        conn.execute("DROP TABLE video_tasks")
        conn.execute(
            "CREATE TABLE video_tasks (video_id TEXT PRIMARY KEY, "
            "upstream_key_id INTEGER NOT NULL, created_at TEXT NOT NULL)"
        )
        conn.execute("INSERT INTO video_tasks VALUES ('video-old', 2, '2026-10-03 00:00:00')")
    await appdb.init_db()
    await appdb.init_db()
    payload = {"status": "completed", "url": "https://cdn.test/old.mp4"}
    response = await poll_video(library, "video-old", payload)
    assert response.json() == payload
    assert library.requests[0].headers["authorization"] == "Bearer sk-library-2"
    item = (await listing(library, "video"))["items"][0]
    assert item["video_id"] == "video-old"
    assert item["model"] == VIDEO_MODEL


async def test_capture_failure_does_not_break_generation(library, monkeypatch):
    from app import media

    async def unavailable(*args, **kwargs):
        raise RuntimeError("simulated library write failure")

    monkeypatch.setattr(media, "_save", unavailable)
    payload = {"data": [{"url": "https://cdn.test/keep-response.png"}]}
    response = await generate_image(library, payload)
    assert response.status_code == 200
    assert response.json() == payload
