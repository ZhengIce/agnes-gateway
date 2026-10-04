#!/usr/local/bin/python
"""Prepare bind-mounted state and run the service as the unprivileged user."""
from __future__ import annotations

import os
import pwd
import sys
from pathlib import Path

DATA_DIR = Path("/app/data")
SERVICE_USER = "agnes"


def _chown(path: Path, uid: int, gid: int) -> None:
    os.chown(path, uid, gid, follow_symlinks=False)


def prepare_data(data_dir: Path, uid: int, gid: int) -> None:
    data_dir.mkdir(parents=True, exist_ok=True)
    for current, directories, files in os.walk(data_dir, followlinks=False):
        current_path = Path(current)
        _chown(current_path, uid, gid)
        for name in (*directories, *files):
            _chown(current_path / name, uid, gid)


def drop_privileges(user: str) -> None:
    if os.geteuid() != 0:
        return

    account = pwd.getpwnam(user)
    os.initgroups(user, account.pw_gid)
    os.setgid(account.pw_gid)
    os.setuid(account.pw_uid)


def main() -> None:
    command = sys.argv[1:]
    if not command:
        raise SystemExit("docker-entrypoint.py requires a command")

    if os.geteuid() == 0:
        account = pwd.getpwnam(SERVICE_USER)
        prepare_data(DATA_DIR, account.pw_uid, account.pw_gid)
        drop_privileges(SERVICE_USER)

    if "/" in command[0]:
        os.execv(command[0], command)
    os.execvp(command[0], command)


if __name__ == "__main__":
    main()
