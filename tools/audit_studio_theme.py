#!/usr/bin/env python3
"""Static audit for the PRINTELLY Studio AI theme."""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSS = ROOT / "studio-legendary-theme.css"
STANDALONE = ROOT / "background-studio" / "standalone.css"
UI = ROOT / "studio-legendary-ui.js"

REQUIRED_VARIABLES = {
    "studio-bg-main", "studio-bg-panel", "studio-bg-input", "studio-border-soft",
    "studio-text-primary", "studio-text-secondary", "studio-text-muted",
    "studio-accent", "studio-accent-ink", "studio-warning", "studio-danger",
}
REQUIRED_SELECTORS = {
    "body.br-pro-upgraded .br-workspace",
    "body.br-pro-upgraded .br-canvas-shell",
    ".br-pro-color-controls",
    ".br-pro-preflight",
    ".studio-final-summary",
    "body.br-pro-upgraded.br-standalone #brAddToOrder",
}
FORBIDDEN_LIGHT_TOKENS = {"#fff7f6", "#fafafb", "#f0f1f3", "#eef0f3", "color-scheme:light"}


def selector_names(css: str) -> list[str]:
    cleaned = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    return [m.group(1).strip() for m in re.finditer(r"([^{}@][^{}]*)\{", cleaned) if not m.group(1).strip().startswith(("from", "to"))]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", dest="json_path")
    args = parser.parse_args()

    errors: list[str] = []
    warnings: list[str] = []
    css = CSS.read_text(encoding="utf-8")
    standalone = STANDALONE.read_text(encoding="utf-8")
    ui = UI.read_text(encoding="utf-8")

    variables = set(re.findall(r"--([a-z0-9-]+)\s*:", css, flags=re.I))
    missing_variables = sorted(REQUIRED_VARIABLES - variables)
    if missing_variables:
        errors.append("Variables CSS manquantes: " + ", ".join(missing_variables))

    for selector in sorted(REQUIRED_SELECTORS):
        if selector not in css:
            errors.append(f"Sélecteur requis absent: {selector}")

    lower = (css + standalone).lower()
    for token in sorted(FORBIDDEN_LIGHT_TOKENS):
        if token in lower:
            errors.append(f"Ancien thème clair encore actif: {token}")

    hardcoded = re.findall(r"#[0-9a-fA-F]{3,8}\b", css)
    declaration_block = css.split("}", 1)[0]
    theme_hex = set(re.findall(r"#[0-9a-fA-F]{3,8}\b", declaration_block))
    component_hex = [value for value in hardcoded if value not in theme_hex]
    if len(component_hex) > 12:
        warnings.append(f"{len(component_hex)} couleurs hexadécimales restent hors variables de thème")

    selectors = selector_names(css)
    duplicate_selectors = sorted(name for name, count in Counter(selectors).items() if count > 1)
    if len(duplicate_selectors) > 8:
        warnings.append(f"Sélecteurs dupliqués à surveiller: {len(duplicate_selectors)}")

    important_count = css.count("!important") + standalone.count("!important")
    if important_count > 5:
        warnings.append(f"Usage élevé de !important: {important_count}")

    for contract in ("studio-control-group", "studio-final-summary", "studioThemeReady"):
        if contract not in ui:
            errors.append(f"Contrat UI absent: {contract}")

    report = {
        "success": not errors,
        "files": [str(CSS.relative_to(ROOT)), str(STANDALONE.relative_to(ROOT)), str(UI.relative_to(ROOT))],
        "variables": len(variables),
        "component_hex_colors": len(component_hex),
        "important_count": important_count,
        "duplicate_selector_count": len(duplicate_selectors),
        "errors": errors,
        "warnings": warnings,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if args.json_path:
        path = ROOT / args.json_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
