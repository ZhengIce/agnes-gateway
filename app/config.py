"""配置加载：config.yaml → Settings 单例，支持热重载。密钥不存于配置文件。"""
from __future__ import annotations

import copy
from dataclasses import dataclass, field
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / "config.yaml"
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "gateway.db"

# 上游 RPM 限制默认值（来源：Token Plan FAQ）
DEFAULT_UPSTREAM_RPM = {
    "text": {"free": 10, "enterprise": 20, "token_plan": 1000},
    "image": {"free": 10, "enterprise": 40, "token_plan": 100},
    "video": {"free": 1, "enterprise": 2, "token_plan": 5},
}

DEFAULT_PRICING = {
    "text": {
        "agnes-2.5-pro": {"input": 3.0, "cached_input": 0.30, "output": 6.0},
        "agnes-2.5-flash": {"input": 0, "cached_input": 0, "output": 0},
        "agnes-3.0-flash": {"input": 0, "cached_input": 0, "output": 0},
    },
    "image": {
        "models": ["agnes-image-2.0-flash", "agnes-image-2.1-flash", "agnes-image-2.5-flash"],
        "per_image": {"1K": 0, "2K": 0, "3K": 0, "4K": 0},
        "free_references": 3,
        "extra_reference": 0,
    },
    "video": {
        "models": ["agnes-video-2.5", "agnes-video-2.5-flash"],
        "per_second": {"720P": 0, "1080P": 0, "1K": 0, "2K": 0},
        "free_images": 5,
        "extra_image": 0,
    },
}


@dataclass
class Settings:
    host: str = "0.0.0.0"
    port: int = 8787
    admin_token: str = ""
    base_url: str = "https://api.agnes-ai.cn"
    timeouts: dict = field(default_factory=lambda: {"text": 300, "image": 360, "video": 120})
    upstream_rpm_limits: dict = field(default_factory=lambda: copy.deepcopy(DEFAULT_UPSTREAM_RPM))
    cooldown_seconds: float = 60
    max_retries: int = 3
    retry_backoff: float = 0.5
    gateway_default_rpm: dict = field(default_factory=lambda: {"text": 60, "image": 20, "video": 10})
    model_aliases: dict = field(default_factory=dict)
    failover: dict = field(default_factory=dict)
    pricing: dict = field(default_factory=lambda: copy.deepcopy(DEFAULT_PRICING))

    def reload(self) -> None:
        data: dict = {}
        if CONFIG_PATH.exists():
            data = yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8")) or {}

        server = data.get("server") or {}
        self.host = str(server.get("host", self.host))
        self.port = int(server.get("port", self.port))
        self.admin_token = str(data.get("admin_token") or "")

        up = data.get("upstream") or {}
        self.base_url = str(up.get("base_url", self.base_url)).rstrip("/")
        for cat, sec in (up.get("timeouts") or {}).items():
            self.timeouts[cat] = float(sec)
        limits = copy.deepcopy(DEFAULT_UPSTREAM_RPM)
        for cat, mapping in (up.get("rpm_limits") or {}).items():
            limits.setdefault(cat, {}).update({k: int(v) for k, v in mapping.items()})
        self.upstream_rpm_limits = limits
        self.cooldown_seconds = float(up.get("cooldown_seconds", self.cooldown_seconds))
        self.max_retries = int(up.get("max_retries", self.max_retries))
        self.retry_backoff = float(up.get("retry_backoff", self.retry_backoff))

        gw = data.get("gateway") or {}
        self.gateway_default_rpm = {k: int(v) for k, v in (gw.get("default_rpm_limits") or self.gateway_default_rpm).items()}

        self.model_aliases = {str(k): str(v) for k, v in (data.get("model_aliases") or {}).items()}
        self.failover = {str(k): [str(m) for m in v] for k, v in (data.get("failover") or {}).items()}

        pricing = copy.deepcopy(DEFAULT_PRICING)
        user_pricing = data.get("pricing") or {}
        for cat, section in user_pricing.items():
            if isinstance(section, dict):
                pricing.setdefault(cat, {}).update(section)
        self.pricing = pricing


settings = Settings()
settings.reload()
