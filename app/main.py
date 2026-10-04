"""应用入口：uv run uvicorn app.main:app --port 8787"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse, Response

from . import db, keypool
from .config import ROOT
from .routes import admin, anthropic, images, openai, passthrough, videos

DIST = ROOT / "frontend" / "dist"


@asynccontextmanager
async def lifespan(_: FastAPI):
    await db.init_db()
    await keypool.pool.load()
    yield


app = FastAPI(title="Agnes Gateway", docs_url=None, redoc_url=None, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# API 路由（先于 /admin 静态托管注册，/admin/api 优先匹配）
app.include_router(openai.router)
app.include_router(anthropic.router)
app.include_router(images.router)
app.include_router(videos.router)
app.include_router(passthrough.router)
app.include_router(admin.router)


@app.get("/")
async def root():
    return RedirectResponse("/admin/")


def _spa_response(full_path: str) -> Response:
    if not DIST.exists():
        return HTMLResponse(
            "<h3>管理面板尚未构建</h3><p>请先执行：<code>cd frontend && npm install && npm run build</code></p>"
        )
    if full_path:
        target = (DIST / full_path).resolve()
        if str(target).startswith(str(DIST.resolve())) and target.is_file():
            return FileResponse(target)
    return FileResponse(DIST / "index.html")


@app.get("/admin", include_in_schema=False)
async def admin_index():
    return _spa_response("")


@app.get("/admin/{full_path:path}", include_in_schema=False)
async def admin_spa(full_path: str):
    return _spa_response(full_path)
