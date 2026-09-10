"""Collect BDMBSM Server Stats for all regions and send one daily payload."""
from __future__ import annotations

import json
import os
import re
import urllib.request
from urllib.parse import urlsplit
from datetime import datetime, timedelta, timezone
from typing import Any

from dotenv import load_dotenv
from playwright.sync_api import Page, sync_playwright

LOGIN_URL = "https://dbonk.com/bdmbsmv2/index.php"
SERVERS = ("ASIA", "EUROPE", "AMERICA")


def env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def click_text(page: Page, label: str) -> None:
    rx = re.compile(rf"^\s*{re.escape(label)}\s*$", re.I)
    for locator in (page.get_by_text(rx), page.get_by_role("button", name=rx), page.get_by_role("link", name=rx)):
        for i in range(locator.count()):
            item = locator.nth(i)
            try:
                item.scroll_into_view_if_needed(timeout=2000)
                if item.is_visible():
                    item.click(timeout=5000)
                    page.wait_for_timeout(1200)
                    return
            except Exception:
                pass
    # Material-style menus often expose icon text together with the label
    # (for example "settings Setting"). Pick the smallest visible partial match.
    broad = page.locator("a,button,li,[role='button'],[role='link'],[role='menuitem'],span,div,p")
    matches = []
    for i in range(min(broad.count(), 500)):
        try:
            item = broad.nth(i)
            text = re.sub(r"\\s+", " ", item.inner_text()).strip()
            if item.is_visible() and label.lower() in text.lower() and len(text) <= 60:
                box = item.bounding_box()
                if box:
                    matches.append((box["width"] * box["height"], item))
        except Exception:
            continue
    if matches:
        item = min(matches, key=lambda pair: pair[0])[1]
        item.scroll_into_view_if_needed()
        item.click(timeout=5000)
        page.wait_for_timeout(1200)
        return

    # Sidebar entries can be outside a nested scroll area even though they exist in
    # the DOM. Click their nearest interactive ancestor directly in that case.
    clicked = page.evaluate("""label => {
      const wanted = label.trim().toLowerCase();
      const nodes = [...document.querySelectorAll('a,button,[role=button],[role=link],li,div,span')];
      const exact = nodes.filter(el => (el.textContent || '').trim().toLowerCase() === wanted);
      const el = exact.find(x => x.closest('a,button,[role=button],[role=link]')) || exact[0];
      const target = el && (el.closest('a,button,[role=button],[role=link]') || el);
      if (!target) return false;
      target.scrollIntoView({block:'center'});
      target.click();
      return true;
    }""", label)
    if clicked:
        page.wait_for_timeout(1200)
        return
    raise RuntimeError(f"menu item not found: {label}")


def login(page: Page) -> None:
    page.goto(LOGIN_URL, wait_until="domcontentloaded")
    user = page.locator("input[placeholder='Input Username']")
    password = page.locator("input[placeholder='Input Password'],input[type='password']")
    if user.count() and password.count():
        user.first.fill(env("DBONK_USERNAME")); password.first.fill(env("DBONK_PASSWORD"))
        button = page.get_by_role("button", name=re.compile(r"^\s*Login\s*$", re.I))
        button.first.click() if button.count() else password.first.press("Enter")
        page.wait_for_timeout(1800)
    if page.get_by_text(re.compile(r"^\s*Asia\s*$", re.I)).count():
        click_text(page, "Asia")


def open_menu(page: Page, name: str) -> None:
    for candidate in (page.locator("button:has-text('menu')"), page.locator("[aria-label*='menu' i]")):
        if candidate.count() and candidate.first.is_visible():
            candidate.first.click(timeout=3000); page.wait_for_timeout(400); break
    click_text(page, name)


def set_server(page: Page, server: str) -> None:
    open_menu(page, "Setting")
    page.get_by_text(re.compile(r"View Server", re.I)).first.wait_for(timeout=10000)
    # Prefer a native/select-like control, then fall back to visible server labels.
    selects = page.locator("select")
    for i in range(selects.count()):
        options = selects.nth(i).locator("option").all_inner_texts()
        if any(server.lower() in x.lower() for x in options):
            option = next(x for x in options if server.lower() in x.lower())
            selects.nth(i).select_option(label=option); page.wait_for_timeout(1500); return
    click_text(page, "View Server")
    aliases = {"ASIA": ("Asia",), "EUROPE": ("Europe", "European"), "AMERICA": ("America", "North America")}
    for label in aliases[server]:
        try:
            click_text(page, label); return
        except RuntimeError:
            pass
    raise RuntimeError(f"View Server option not found: {server}")


def number_after(body: str, label: str) -> int:
    match = re.search(rf"{re.escape(label)}\s*([\d,]+)", body, re.I)
    if not match:
        raise RuntimeError(f"stat not found: {label}")
    return int(match.group(1).replace(",", ""))


def stat_number(page: Page, label: str) -> int:
    body = page.locator("body").inner_text()
    try:
        return number_after(body, label)
    except RuntimeError:
        pass
    texts = page.evaluate("""label => {
      const wanted = label.toLowerCase().replace(/[^a-z0-9]+/g, '');
      return [...document.querySelectorAll('div,section,article,li,td,p,span')]
        .map(el => (el.innerText || '').trim())
        .filter(text => text && text.toLowerCase().replace(/[^a-z0-9]+/g, '').includes(wanted))
        .sort((a,b) => a.length - b.length)
        .slice(0, 20);
    }""", label)
    for text in texts:
        without_period = re.sub(r"\\(?\\s*1\\s+MONTH\\s*\\)?", "", text, flags=re.I)\n        numbers = [int(x.replace(",", "")) for x in re.findall(r"\\d[\\d,]*", without_period)]
        values = [value for value in numbers if value > 1]
        if values:
            return values[-1]
    raise RuntimeError(f"stat not found: {label}")


def extract_classes(page: Page) -> list[dict[str, Any]]:
    raw = page.evaluate("""() => {
      const clean = s => (s || '').replace(/\\s+/g, ' ').trim();
      const out = [];
      document.querySelectorAll('table tr,[role=row]').forEach(row => {
        const cells = [...row.querySelectorAll('td,[role=cell]')].map(x => clean(x.textContent));
        if (cells.length >= 2 && /^\\d[\\d,]*$/.test(cells[cells.length-1])) out.push([cells[cells.length-2], cells[cells.length-1]]);
      });
      document.querySelectorAll('svg text,.apexcharts-legend-text,.highcharts-legend-item text').forEach(x => {
        const text = clean(x.textContent); const m = text.match(/^(.+?)\\s*[:–-]?\\s*(\\d[\\d,]*)$/); if (m) out.push([m[1],m[2]]);
      });
      const charts = [];
      if (window.Apex && Array.isArray(window.Apex._chartInstances)) window.Apex._chartInstances.forEach(x => charts.push({labels:x.chart?.w?.globals?.labels,series:x.chart?.w?.globals?.series}));
      if (window.Highcharts && Array.isArray(window.Highcharts.charts)) window.Highcharts.charts.filter(Boolean).forEach(c => charts.push({labels:c.xAxis?.[0]?.categories,series:c.series?.[0]?.yData}));
      charts.forEach(c => (c.labels || []).forEach((label,i) => out.push([clean(String(label)), String((c.series || [])[i] ?? '')])));
      return out;
    }""")
    ignored = re.compile(r"player|guild|total|active|month|rank|server|stats", re.I)
    merged: dict[str, int] = {}
    for name, value in raw:
        name = str(name).strip(); digits = re.sub(r"\D", "", str(value))
        if name and digits and not ignored.search(name): merged[name] = int(digits)
    result = [{"class_name": name, "player_count": count, "sort_order": i} for i, (name, count) in enumerate(merged.items())]
    if not result or not 900 <= sum(x["player_count"] for x in result) <= 1100:
        raise RuntimeError(f"Main Class Popularity extraction failed (rows={len(result)}, sum={sum(x['player_count'] for x in result)})")
    return result


def collect(page: Page, server: str) -> dict[str, Any]:
    set_server(page, server); open_menu(page, "Server Stats")
    page.get_by_text(re.compile(r"TOTAL PLAYERS", re.I)).first.wait_for(timeout=15000)
    page.wait_for_function(
        """() => {
          const text = document.body.innerText.toUpperCase();
          return text.includes('ACTIVE PLAYERS') &&
                 text.includes('TOTAL GUILDS') &&
                 text.includes('ACTIVE GUILDS') &&
                 text.includes('MAIN CLASS POPULARITY');
        }""",
        timeout=30000,
    )
    page.wait_for_timeout(1200)
    now = datetime.now(timezone(timedelta(hours=9)))
    return {"server": server, "captured_date": now.date().isoformat(), "captured_at": now.isoformat(),
            "total_players": stat_number(page, "TOTAL PLAYERS"),
            "active_players": stat_number(page, "ACTIVE PLAYERS (1 MONTH)"),
            "total_guilds": stat_number(page, "TOTAL GUILDS"),
            "active_guilds": stat_number(page, "ACTIVE GUILDS"),
            "classes": extract_classes(page)}


def post(payload: list[dict[str, Any]]) -> None:
    request = urllib.request.Request(env("STATS_INGEST_URL"), data=json.dumps(payload).encode(), method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {env('STATS_INGEST_TOKEN')}"})
    with urllib.request.urlopen(request, timeout=30) as response:
        if response.status != 200: raise RuntimeError(f"ingest failed: HTTP {response.status}")


def main() -> None:
    load_dotenv()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=os.getenv("HEADLESS", "1") != "0")
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        try:
            login(page)
            # Some DBank sessions replace the login page and open the dashboard
            # in another tab. Continue with the newest non-empty page.
            for candidate in reversed(page.context.pages):
                try:
                    if candidate.locator("body").inner_text().strip():
                        page = candidate
                        break
                except Exception:
                    continue
            page.wait_for_timeout(1000)
            # The dashboard is rendered inside an iframe. Choose the frame that
            # contains the navigation labels (or, as fallback, the most text).
            frames = page.frames
            frame_candidates = []
            for frame in frames:
                try:
                    text = frame.locator("body").inner_text()
                    score = sum(label.lower() in text.lower() for label in ("Server Stats", "Setting", "Guild Ranking"))
                    frame_candidates.append((score, len(text), frame))
                except Exception:
                    continue
            if frame_candidates:
                score, _, dashboard = max(frame_candidates, key=lambda item: (item[0], item[1]))
                if score:
                    page = dashboard
            payload = [collect(page, server) for server in SERVERS]
        except Exception:
            location = urlsplit(page.url)
            checks = {}
            for label in ("Setting", "Settings", "Server Stats", "View Server", "Asia", "Logout", "Login"):
                checks[label] = page.get_by_text(re.compile(rf"^\\s*{re.escape(label)}\\s*$", re.I)).count()
            print("DIAGNOSTIC:", json.dumps({
                "page": f"{location.scheme}://{location.netloc}{location.path}",
                "login_form": page.locator("input[type='password']").count(),
                "known_labels": checks,
                "links": page.locator("a").count(),
                "buttons": page.locator("button").count(),
                "frames": len(frames),
                "frame_scores": [[score, length] for score, length, _ in frame_candidates],
                "html_length": len(page.content()),
            }))
            raise
        finally:
            browser.close()
    post(payload); print(json.dumps({"ok": True, "servers": [x["server"] for x in payload]}))


if __name__ == "__main__": main()
