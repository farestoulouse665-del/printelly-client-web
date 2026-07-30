#!/usr/bin/env python3
"""Contract checks for the responsive Studio AI layout."""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "background-studio" / "index.html"
CSS = ROOT / "studio-legendary-theme.css"
STANDALONE = ROOT / "background-studio" / "standalone.css"
LOADER = ROOT / "studio-credit-badge.js"
UI = ROOT / "studio-legendary-ui.js"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", dest="json_path")
    args = parser.parse_args()
    html = HTML.read_text(encoding="utf-8")
    css = CSS.read_text(encoding="utf-8")
    standalone = STANDALONE.read_text(encoding="utf-8")
    loader = LOADER.read_text(encoding="utf-8")
    ui = UI.read_text(encoding="utf-8")
    errors: list[str] = []

    for element_id in ("brLeftControls", "brCanvas", "brRightControls", "brQualityPanel", "brDownload", "brAddToOrder"):
        if f'id="{element_id}"' not in html:
            errors.append(f"Élément Studio absent: {element_id}")

    required_css = [
        'grid-template-areas:"left center right"',
        "height:auto",
        "min-height:720px",
        "@media(max-width:1180px)",
        "@media(max-width:820px)",
        "@media(max-width:560px)",
        "display:inline-flex!important",
    ]
    for contract in required_css:
        if contract not in css:
            errors.append(f"Contrat responsive absent: {contract}")

    if re.search(r"#brAddToOrder\s*\{[^}]*display\s*:\s*none\s*!important", standalone, flags=re.S):
        errors.append("Le bouton Ajouter à la commande est encore masqué par standalone.css")
    if "color-scheme:dark" not in standalone.replace(" ", ""):
        errors.append("Le thème sombre de base n'est pas activé")
    for asset in ("studio-pro-upgrade.css", "studio-pro-upgrade.js", "studio-legendary-ui.js"):
        if asset not in loader:
            errors.append(f"Asset non chargé: {asset}")
    if "studio-final-summary" not in ui or "studio-control-group" not in ui:
        errors.append("La structure finale ou les groupes colorimétriques sont absents")

    report = {"success": not errors, "errors": errors, "contracts_checked": 6 + len(required_css) + 5}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if args.json_path:
        path = ROOT / args.json_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
