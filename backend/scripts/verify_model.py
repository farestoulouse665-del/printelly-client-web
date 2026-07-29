from __future__ import annotations

import argparse
import hashlib
from pathlib import Path

import onnxruntime as ort


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description="Vérifie le modèle ONNX local approuvé.")
    parser.add_argument(
        "--model",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "models/background-removal.onnx",
    )
    parser.add_argument("--sha256", default="")
    parser.add_argument("--load", action="store_true", help="Charge aussi le graphe ONNX.")
    args = parser.parse_args()
    model = args.model.resolve()
    if not model.is_file():
        raise SystemExit(f"Modèle absent: {model}")
    actual = sha256(model)
    if args.sha256 and actual.lower() != args.sha256.strip().lower():
        raise SystemExit(f"SHA-256 incorrect: {actual}")
    print(f"Modèle: {model}")
    print(f"Taille: {model.stat().st_size} octets")
    print(f"SHA-256: {actual}")
    print("Fournisseurs ONNX Runtime: " + ", ".join(ort.get_available_providers()))
    if args.load:
        session = ort.InferenceSession(str(model), providers=["CPUExecutionProvider"])
        for model_input in session.get_inputs():
            print(f"Entrée: {model_input.name} {model_input.shape} {model_input.type}")
        print("Chargement ONNX: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
