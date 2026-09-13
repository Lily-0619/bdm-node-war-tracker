"""Run DBank Name Search only for people selected on the admin page."""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright


RUN_ID = int(os.environ["KARTE_RUN_ID"])
API = os.environ["KARTE_API_BASE"].rstrip("/")
TOKEN = os.environ["KARTE_INGEST_TOKEN"]
SOURCE_ROOT = Path(os.environ.get("KARTE_SOURCE_ROOT", "guild-karte")).resolve()
sys.path.insert(0, str(SOURCE_ROOT))
from src import scraper  # noqa: E402


def request(path: str, payload: dict | None = None) -> dict:
    data = json.dumps(payload).encode() if payload is not None else None
    for attempt in range(6):
        req = urllib.request.Request(API + path, data=data, method="POST" if data is not None else "GET",
            headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json",
                     "User-Agent": "bdm-node-war-tracker/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                return json.load(response)
        except urllib.error.HTTPError as exc:
            if exc.code not in (429, 500, 502, 503, 504) or attempt == 5:
                raise
        except (TimeoutError, urllib.error.URLError):
            if attempt == 5:
                raise
        time.sleep(2 ** attempt)
    raise RuntimeError("request retry exhausted")


def main() -> None:
    config = request(f"/api/guild-karte/job-config/{RUN_ID}")
    targets = config.get("tracked", [])
    results: list[dict] = []
    if targets:
        scraper.load_project_env(scraper.ENV_PATH)
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1440, "height": 1000})
            page.goto(scraper.DBONK_LOGIN_URL, wait_until="domcontentloaded")
            scraper.try_auto_login(page)
            scraper.try_select_asia_server(page)
            for target in targets:
                name = str(target["current_family_name"])
                item = {"person_id": int(target["id"]), "searched_name": name}
                try:
                    scraper.open_search_page(page)
                    scraper.run_name_search(page, name)
                    spans = page.locator("result#playersearch span[data-id]")
                    names = [spans.nth(i).inner_text().strip() for i in range(spans.count())]
                    exact = next((value for value in names if value == name or value.casefold() == name.casefold()), None)
                    if exact:
                        item.update(result="found", found_name=exact, raw={"candidates": names})
                    elif len(names) == 1:
                        item.update(result="renamed", found_name=names[0], raw={"candidates": names})
                    else:
                        item.update(result="not_found", raw={"candidates": names})
                except Exception as exc:
                    item.update(result="error", raw={"error": str(exc)[:500]})
                results.append(item)
            browser.close()
    request(f"/api/guild-karte/tracking-results/{RUN_ID}", {"results": results})
    state = request(f"/api/guild-karte/job-config/{RUN_ID}")
    if (state.get("run") or {}).get("status") == "failed":
        print(json.dumps({"ok": False, "tracked": len(results), "run": state["run_id"],
                          "reason": "collection failed"}))
        return
    # Guild failures are already recorded; the status endpoint keeps their count.
    has_failures = int((state.get("run") or {}).get("failed_guilds") or 0) > 0
    request(f"/api/guild-karte/progress/{RUN_ID}", {
        "status": "partial" if has_failures else "completed",
        "phase": "一部失敗" if has_failures else "完了"})
    print(json.dumps({"ok": True, "tracked": len(results), "run": state["run_id"]}))


if __name__ == "__main__":
    main()
