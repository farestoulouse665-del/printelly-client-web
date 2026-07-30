#!/usr/bin/env python3
"""WCAG contrast checks for core Studio AI theme tokens."""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSS = ROOT / "studio-legendary-theme.css"


def rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    if len(value) == 3:
        value = "".join(ch * 2 for ch in value)
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def luminance(value: str) -> float:
    channels = [component / 255 for component in rgb(value)]
    linear = [channel / 12.92 if channel <= 0.03928 else ((channel + 0.055) / 1.055) ** 2.4 for channel in channels]
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]


def contrast(a: str, b: str) -> float:
    high, low = sorted((luminance(a), luminance(b)), reverse=True)
    return (high + 0.05) / (low + 0.05)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", dest="json_path")
    args = parser.parse_args()
    css = CSS.read_text(encoding="utf-8")
    tokens = dict(re.findall(r"--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\b", css, flags=re.I))
    checks = [
        ("Texte principal", "studio-text-primary", "studio-bg-main", 4.5),
        ("Texte secondaire", "studio-text-secondary", "studio-bg-panel", 4.5),
        ("Champ de saisie", "studio-text-primary", "studio-bg-input", 4.5),
        ("Bouton principal", "studio-accent-ink", "studio-accent", 4.5),
        ("Avertissement", "studio-warning-ink", "studio-warning", 4.5),
        ("Erreur", "studio-danger-ink", "studio-danger", 4.5),
        ("Succès", "studio-success-ink", "studio-success", 4.5),
    ]
    results = []
    errors = []
    for label, foreground, background, minimum in checks:
        if foreground not in tokens or background not in tokens:
            errors.append(f"Jeton absent pour {label}: {foreground}/{background}")
            continue
        ratio = contrast(tokens[foreground], tokens[background])
        passed = ratio >= minimum
        results.append({"label": label, "foreground": tokens[foreground], "background": tokens[background], "ratio": round(ratio, 2), "minimum": minimum, "passed": passed})
        if not passed:
            errors.append(f"Contraste insuffisant pour {label}: {ratio:.2f}:1")
    report = {"success": not errors, "checks": results, "errors": errors}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if args.json_path:
        path = ROOT / args.json_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
