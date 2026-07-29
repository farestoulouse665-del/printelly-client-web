from __future__ import annotations

import argparse
import hashlib
import shutil
import sys
import urllib.request
from pathlib import Path

DEFAULT_URL = (
    "https://github.com/ZhengPeng7/BiRefNet/releases/download/v1/"
    "BiRefNet-general-bb_swin_v1_tiny-epoch_232.onnx"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Télécharge explicitement le modèle BiRefNet ONNX et vérifie son SHA-256."
    )
    parser.add_argument("--url", default=DEFAULT_URL)
    parser.add_argument("--output", type=Path, default=Path("models/background-removal.onnx"))
    parser.add_argument(
        "--sha256",
        required=True,
        help="Empreinte approuvée par le propriétaire du déploiement (64 caractères hexadécimaux).",
    )
    parser.add_argument(
        "--accept-mit-license",
        action="store_true",
        help="Confirme la lecture de MODEL_LICENSE.md et l'acceptation de la licence MIT.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    expected = args.sha256.strip().lower()
    if not args.accept_mit_license:
        print("Ajoutez --accept-mit-license après lecture de MODEL_LICENSE.md.", file=sys.stderr)
        return 2
    if len(expected) != 64 or any(char not in "0123456789abcdef" for char in expected):
        print("--sha256 doit contenir exactement 64 caractères hexadécimaux.", file=sys.stderr)
        return 2

    args.output.parent.mkdir(parents=True, exist_ok=True)
    partial = args.output.with_suffix(args.output.suffix + ".part")
    digest = hashlib.sha256()
    try:
        request = urllib.request.Request(args.url, headers={"User-Agent": "PRINTELLY-model-installer/1"})
        with urllib.request.urlopen(request, timeout=60) as response, partial.open("wb") as target:
            while chunk := response.read(1024 * 1024):
                digest.update(chunk)
                target.write(chunk)
        actual = digest.hexdigest()
        if actual != expected:
            print(f"SHA-256 incorrect. Attendu {expected}; obtenu {actual}.", file=sys.stderr)
            return 1
        shutil.move(str(partial), str(args.output))
        print(f"Modèle installé: {args.output.resolve()}")
        print(f"SHA-256: {actual}")
        return 0
    finally:
        partial.unlink(missing_ok=True)


if __name__ == "__main__":
    raise SystemExit(main())
