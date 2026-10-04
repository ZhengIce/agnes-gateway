# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS frontend-builder

WORKDIR /build/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY app/ ./app/
COPY scripts/ ./scripts/
COPY config.example.yaml ./config.example.yaml
COPY docker-entrypoint.py /usr/local/bin/docker-entrypoint.py
COPY --from=frontend-builder /build/frontend/dist ./frontend/dist

RUN mkdir -p /app/data \
    && useradd --system --create-home --home-dir /app --shell /usr/sbin/nologin agnes \
    && chown -R agnes:agnes /app \
    && chmod 755 /usr/local/bin/docker-entrypoint.py

# The entrypoint repairs bind-mounted /app/data as root, then drops to agnes.
USER root
ENTRYPOINT ["/usr/local/bin/python", "/usr/local/bin/docker-entrypoint.py"]

EXPOSE 8787
VOLUME ["/app/data"]

CMD ["/app/.venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8787"]
