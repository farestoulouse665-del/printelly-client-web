from __future__ import annotations

import shlex
import subprocess
from pathlib import Path

from fastapi import HTTPException

from app.core.config import Settings


def scan_local_file(path: Path, config: Settings) -> None:
    """Invoke the configured local scanner without a shell or remote service."""
    if not config.antivirus_command:
        return
    try:
        command = shlex.split(config.antivirus_command, posix=True)
    except ValueError as exc:
        raise HTTPException(status_code=503, detail="Configuration antivirus invalide.") from exc
    if not command:
        return
    try:
        result = subprocess.run(
            [*command, str(path)],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            timeout=90,
            shell=False,
            env={
                "PATH": "/usr/local/bin:/usr/bin:/bin",
                "TMPDIR": "/tmp",
                "LANG": "C.UTF-8",
            },
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise HTTPException(
            status_code=503,
            detail="Le scanner antivirus local est indisponible.",
        ) from exc
    if result.returncode != 0:
        raise HTTPException(
            status_code=422,
            detail="Le fichier a été refusé par le scanner antivirus local.",
        )
