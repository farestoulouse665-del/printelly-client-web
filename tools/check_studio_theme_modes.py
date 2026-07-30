#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSS = ROOT / "studio-three-themes.css"
JS = ROOT / "studio-three-themes.js"
LOADER = ROOT / "studio-credit-badge.js"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", dest="json_path")
    args = parser.parse_args()
    css = CSS.read_text(encoding="utf-8")
    js = JS.read_text(encoding="utf-8")
    loader = LOADER.read_text(encoding="utf-8")
    checks = {
        "light_theme": 'data-studio-theme="light"' in css,
        "dark_theme": 'data-studio-theme="dark"' in css,
        "legendary_theme": 'data-studio-theme="legendary"' in css,
        "theme_switcher": "studioThemeSwitcher" in js,
        "theme_persistence": "printellyStudioTheme" in js and "printellyStudioTheme" in loader,
        "theme_before_modules": loader.find("dataset.studioTheme") < loader.find("loadStyle"),
        "accessible_pressed_state": "aria-pressed" in js,
        "reduced_motion": "prefers-reduced-motion" in css,
        "mobile_theme_selector": "@media(max-width:680px)" in css,
        "finishing_panel_removed": "right.remove()" in js,
        "result_view_removed": 'data-br-view="result"' in js,
        "recovery_removed": "recovery.remove()" in js,
        "before_after_default": "splitButton.click()" in js and 'splitInput.value = "50"' in js,
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
