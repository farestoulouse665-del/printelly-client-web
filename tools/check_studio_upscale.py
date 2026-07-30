#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JS = ROOT / "studio-upscale.js"
CSS = ROOT / "studio-upscale.css"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", dest="json_path")
    args = parser.parse_args()
    js = JS.read_text(encoding="utf-8")
    css = CSS.read_text(encoding="utf-8")
    checks = {
        "four_k_cap": "MAX_4K_EDGE = 3840" in js,
        "progressive_resize": "progressiveResize" in js and 'imageSmoothingQuality = "high"' in js,
        "edge_aware_sharpen": "edgeAwareSharpen" in js and "threshold" in js,
        "alpha_preserved": "source[i + 3]" in js and "alpha < 48" in js,
        "png_only": '"image/png"' in js,
        "no_credit_claim": "aucun nouveau crédit" in js,
        "order_handoff": "studio-ai-upscale-4k" in js and "saveHandoff" in js,
        "responsive_panel": "@media(max-width:680px)" in css,
        "transparent_pipeline": "alpha: true" in js,
        "honest_quality_copy": "ne peuvent pas être recréés fidèlement" in js,
    }
    errors = [name for name, passed in checks.items() if not passed]
    report = {"success": not errors, "checks": checks, "errors": errors}
    if args.json_path:
        path = ROOT / args.json_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
