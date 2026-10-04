"""初始导入本地密钥文件到 SQLite（幂等、去重）。

用法：
    uv run python scripts/import_keys.py [密钥文件路径]
默认读取项目根目录的 密钥.txt（每行一个 sk- 开头的密钥，忽略空行）。
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app import db as appdb  # noqa: E402
from app.keypool import parse_keys_text, pool  # noqa: E402


async def main() -> None:
    file = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "密钥.txt"
    if not file.exists():
        print(f"密钥文件不存在：{file}")
        sys.exit(1)

    text = file.read_text(encoding="utf-8", errors="replace")
    keys = parse_keys_text(text)
    print(f"从 {file.name} 解析到 {len(keys)} 个密钥")

    await appdb.init_db()
    added, skipped = await pool.add_keys(keys, key_type="free")
    print(f"新增 {added} 个，跳过（重复）{skipped} 个。类型默认 free，可在管理面板修改。")


if __name__ == "__main__":
    asyncio.run(main())
