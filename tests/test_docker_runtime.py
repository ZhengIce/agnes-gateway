from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_docker_runtime_repairs_bind_mount_permissions_before_starting():
    dockerfile = (ROOT / "Dockerfile").read_text(encoding="utf-8")
    entrypoint = ROOT / "docker-entrypoint.py"

    assert entrypoint.is_file()
    assert 'ENTRYPOINT ["/usr/local/bin/python", "/usr/local/bin/docker-entrypoint.py"]' in dockerfile
    assert "USER root" in dockerfile

    source = entrypoint.read_text(encoding="utf-8")
    assert "os.chown" in source
    assert "os.setuid" in source
    assert "os.setgid" in source
    assert "os.execv" in source
