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
CLASS_ALIASES = {"Askeia": "Mystic", "Zayed": "Hashashin", "Sura": "Ninja"}
CLASS_ORDER = (
    "Warrior", "Ranger", "Witch", "Giant", "Valkyrie", "Sorceress", "Musa", "Tamer",
    "Ninja", "Dark Knight", "Striker", "Maehwa", "Lahn", "Mystic", "Wizard", "Shai",
    "Kunoichi", "Archer", "Hashashin", "Nova", "Guardian", "Corsair", "Sage", "Drakania",
    "Maegu", "Woosa", "Scholar", "Dosa", "Deadeye", "Seraph",
)


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
    # DBank has two similar server selectors: #selserver changes the account's
    # home server, while #viewserver changes the statistics being viewed.
    view_server = page.locator("select#viewserver")
    if view_server.count():
        label = f"Server - {server.title()}"
        options = view_server.first.locator("option").all_inner_texts()
        if label in options:
            view_server.first.select_option(label=label)
            page.wait_for_timeout(1500)
            return

    # Fallback for a future markup change.
    selects = page.locator("select")
    for i in range(selects.count()):
        options = selects.nth(i).locator("option").all_inner_texts()
        live_options = [x for x in options if x.strip().lower() == f"server - {server.lower()}"]
        if live_options:
            option = live_options[0]
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


def number_before(body: str, label: str) -> int:
    match = re.search(rf"([\d,]+)\s*{re.escape(label)}", body, re.I)
    if not match:
        raise RuntimeError(f"stat not found: {label}")
    return int(match.group(1).replace(",", ""))


def stat_number(page: Page, label: str) -> int:
    body = page.locator("body").inner_text()
    try:
        return number_before(body, label)
    except RuntimeError:
        pass
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
        without_period = text.upper().replace("(1 MONTH)", "").replace("1 MONTH", "")
        numbers = [int(x.replace(",", "")) for x in re.findall(r"\d[\d,]*", without_period)]
        if numbers:
            return numbers[-1]
    raise RuntimeError(f"stat not found: {label}")


def chart_diagnostics(page: Page) -> dict[str, Any]:
    """Return opt-in, bounded SVG metadata without dumping page HTML or credentials."""
    return page.evaluate(r"""() => {
      const clean = value => (value || '').replace(/\s+/g, ' ').trim();
      const clip = (value, limit = 240) => clean(value).slice(0, limit);
      const chartSummary = (name, instance) => {
        if (!instance) return {name, available: false};
        const series = instance.series?.values || [];
        return {
          name,
          available: true,
          className: instance.className || instance.constructor?.name || '',
          data: Array.isArray(instance.data) ? instance.data.slice(0, 120) : [],
          series: series.map(item => ({
            name: item.name || '',
            dataFields: {...(item.dataFields || {})},
            dataItems: (item.dataItems?.values || []).slice(0, 120).map(value => ({
              categoryX: value.categoryX,
              categoryY: value.categoryY,
              valueX: value.valueX,
              valueY: value.valueY,
              dataContext: value.dataContext
            }))
          }))
        };
      };
      const heading = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,div,p,span')]
        .filter(el => clean(el.textContent).toUpperCase().includes('MAIN CLASS POPULARITY'))
        .sort((a, b) => clean(a.textContent).length - clean(b.textContent).length)[0];
      const headingTrail = [];
      for (let el = heading, depth = 0; el && depth < 5; el = el.parentElement, depth++) {
        headingTrail.push({tag: el.tagName, id: el.id, class: clip(el.className, 120), text: clip(el.innerText)});
      }
      return {
        headingTrail,
        chartGlobals: Object.keys(window).filter(key => /chart|graph|d3|plot|vis/i.test(key)).slice(0, 100),
        chartInstances: ['chart', 'chart2', 'chart3', 'chart4'].map(name => chartSummary(name, window[name])),
        am4Registry: (window.am4core?.registry?.baseSprites || []).map((item, index) => chartSummary(`registry-${index}`, item)),
        svgs: [...document.querySelectorAll('svg')].map((svg, index) => ({svg, index}))
          .filter(({svg}) => svg.getBoundingClientRect().width >= 1000)
          .map(({svg, index}) => {
          const box = svg.getBoundingClientRect();
          const attrs = el => Object.fromEntries([...el.attributes]
            .filter(attr => /^(class|role|aria-|data-|fill|stroke|transform|x|y|width|height|viewBox)/i.test(attr.name))
            .map(attr => [attr.name, clip(attr.value, 160)]));
          return {
            index,
            box: {x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height)},
            parent: {tag: svg.parentElement?.tagName, id: svg.parentElement?.id || '', class: clip(svg.parentElement?.className, 120), text: clip(svg.parentElement?.innerText)},
            attrs: attrs(svg),
            texts: [...svg.querySelectorAll('text')].map(el => clip(el.textContent, 120)).filter(Boolean).slice(0, 220),
            labelled: [...svg.querySelectorAll('[aria-label],[title],title')].map(el => ({
              tag: el.tagName, text: clip(el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent, 180), attrs: attrs(el)
            })).slice(0, 100),
            shapes: [...svg.querySelectorAll('path,rect,circle')].slice(0, 12).map(el => ({
              tag: el.tagName, attrs: attrs(el), dLength: (el.getAttribute('d') || '').length
            }))
          };
        })
      };
    }""")


def extract_classes(page: Page) -> list[dict[str, Any]]:
    raw = page.evaluate("""() => {
      const clean = s => (s || '').replace(/\\s+/g, ' ').trim();
      const out = [];
      // DBank renders its class charts with amCharts 4. The registry retains
      // the source rows even when SVG labels overlap or are visually hidden.
      const sprites = window.am4core?.registry?.baseSprites || [];
      const candidates = sprites.map(sprite => Array.isArray(sprite.data) ? sprite.data : [])
        .map(data => data.map(row => [clean(String(row?.name || '')), String(row?.count ?? '')])
          .filter(([name, count]) => name && /^[0-9][0-9,]*$/.test(count)))
        .filter(rows => rows.length >= 10 && rows.length <= 100)
        .filter(rows => {
          const total = rows.reduce((sum, row) => sum + Number(row[1].replaceAll(',', '')), 0);
          return total >= 900 && total <= 1100;
        });
      if (candidates.length === 1) return candidates[0];

      // Fallbacks for a future chart-library or markup change.
      document.querySelectorAll('table tr,[role=row]').forEach(row => {
        const cells = [...row.querySelectorAll('td,[role=cell]')].map(x => clean(x.textContent));
        if (cells.length >= 2 && /^\\d[\\d,]*$/.test(cells[cells.length-1])) out.push([cells[cells.length-2], cells[cells.length-1]]);
      });
      document.querySelectorAll('svg text,.apexcharts-legend-text,.highcharts-legend-item text').forEach(x => {
        const text = clean(x.textContent); const m = text.match(/^(.+?)\\s*[:–-]?\\s*(\\d[\\d,]*)$/); if (m) out.push([m[1],m[2]]);
      });
      document.querySelectorAll('svg [aria-label],svg [title],svg title').forEach(x => {
        const text = clean(x.getAttribute('aria-label') || x.getAttribute('title') || x.textContent);
        const m = text.match(/^(.+?)[,:]\\s*(\\d[\\d,]*)(?:\\D|$)/);
        if (m) out.push([m[1],m[2]]);
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
        if name and digits and not ignored.search(name):
            canonical = CLASS_ALIASES.get(name, name)
            merged[canonical] = merged.get(canonical, 0) + int(digits)
    unknown = sorted(set(merged) - set(CLASS_ORDER))
    if unknown:
        raise RuntimeError(f"unknown classes: {', '.join(unknown)}")
    # DBank can omit a zero-count class from the chart. Persist the complete,
    # fixed 30-class order so every snapshot renders with the same rows.
    result = [{"class_name": name, "player_count": merged.get(name, 0), "sort_order": i}
              for i, name in enumerate(CLASS_ORDER)]
    if not result or not 900 <= sum(x["player_count"] for x in result) <= 1100:
        if os.getenv("SAVERSTATS_DEBUG", "0") == "1":
            print("CHART_DIAGNOSTIC:", json.dumps(chart_diagnostics(page), ensure_ascii=False))
        meta = page.evaluate("""() => ({
          canvas: document.querySelectorAll('canvas').length,
          svg: document.querySelectorAll('svg').length,
          apex: !!window.Apex,
          highcharts: !!window.Highcharts,
          chartjs: !!window.Chart,
          echarts: !!window.echarts,
          plotly: !!window.Plotly,
          apexInstances: Array.isArray(window.Apex?._chartInstances) ? window.Apex._chartInstances.length : 0,
          highchartInstances: Array.isArray(window.Highcharts?.charts) ? window.Highcharts.charts.filter(Boolean).length : 0,
          am4Datasets: (window.am4core?.registry?.baseSprites || []).map(sprite => {
            const rows = Array.isArray(sprite.data) ? sprite.data : [];
            const counts = rows.map(row => Number(String(row?.count ?? '').replaceAll(',', ''))).filter(Number.isFinite);
            return {rows: rows.length, countRows: counts.length, countSum: counts.reduce((sum, value) => sum + value, 0)};
          }),
          svgStructure: [...document.querySelectorAll('svg')].map(svg => ({
            text: svg.querySelectorAll('text').length,
            path: svg.querySelectorAll('path').length,
            rect: svg.querySelectorAll('rect').length,
            circle: svg.querySelectorAll('circle').length,
            title: svg.querySelectorAll('title').length,
            aria: svg.querySelectorAll('[aria-label]').length,
            htmlLength: svg.outerHTML.length
          })).sort((a,b) => b.htmlLength - a.htmlLength).slice(0, 5),
          framework: {
            angular: !!document.querySelector('[ng-version]'),
            react: !!document.querySelector('[data-reactroot]') || !!document.querySelector('[id=root]'),
            vue: !!document.querySelector('[data-v-app]')
          },
          resources: [...new Set(performance.getEntriesByType('resource').map(entry => {
            try { return new URL(entry.name).pathname; } catch (_) { return ''; }
          }).filter(path => path && /stat|server|api|ajax|json|php/i.test(path)))].slice(-30)
        })""")
        raise RuntimeError(
            f"Main Class Popularity extraction failed "
            f"(rows={len(result)}, sum={sum(x['player_count'] for x in result)}, meta={meta})"
        )
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
    heading = re.search(r"\b(Asia|Europe|America)\s+Server Stats\b", page.locator("body").inner_text(), re.I)
    if not heading or heading.group(1).upper() != server:
        actual = heading.group(1).upper() if heading else "UNKNOWN"
        raise RuntimeError(f"server switch failed: expected {server}, got {actual}")
    now = datetime.now(timezone(timedelta(hours=9)))
    snapshot = {"server": server, "captured_date": now.date().isoformat(), "captured_at": now.isoformat(),
                "total_players": stat_number(page, "TOTAL PLAYERS"),
                "active_players": stat_number(page, "ACTIVE PLAYERS (1 MONTH)"),
                "total_guilds": stat_number(page, "TOTAL GUILDS"),
                "active_guilds": stat_number(page, "ACTIVE GUILDS (1 MONTH)"),
                "classes": extract_classes(page)}
    if snapshot["active_players"] > snapshot["total_players"]:
        raise RuntimeError(f"invalid player totals for {server}")
    if snapshot["active_guilds"] > snapshot["total_guilds"]:
        raise RuntimeError(f"invalid guild totals for {server}")
    return snapshot


def post(payload: list[dict[str, Any]]) -> None:
    request = urllib.request.Request(env("STATS_INGEST_URL"), data=json.dumps(payload).encode(), method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "bdm-node-war-tracker/1.0 (GitHub Actions)",
            "Authorization": f"Bearer {env('STATS_INGEST_TOKEN')}",
        })
    with urllib.request.urlopen(request, timeout=30) as response:
        if response.status != 200: raise RuntimeError(f"ingest failed: HTTP {response.status}")


def main() -> None:
    # Windows editors commonly save .env files with a UTF-8 BOM. Without
    # utf-8-sig, python-dotenv treats the BOM as part of the first key.
    load_dotenv(encoding="utf-8-sig")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=os.getenv("HEADLESS", "1") != "0")
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        frames = []
        frame_candidates = []
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
                checks[label] = page.get_by_text(re.compile(rf"^\s*{re.escape(label)}\s*$", re.I)).count()
            print("DIAGNOSTIC:", json.dumps({
                "page": f"{location.scheme}://{location.netloc}{location.path}",
                "login_form": page.locator("input[type='password']").count(),
                "known_labels": checks,
                "links": page.locator("a").count(),
                "buttons": page.locator("button").count(),
                "selects": page.evaluate("""() => [...document.querySelectorAll('select')].map(select => ({
                  id: select.id, name: select.name, visible: !!(select.offsetWidth || select.offsetHeight),
                  selected: select.selectedOptions[0]?.textContent?.trim() || '',
                  options: [...select.options].map(option => option.textContent.trim()).slice(0, 20)
                }))"""),
                "frames": len(frames),
                "frame_scores": [[score, length] for score, length, _ in frame_candidates],
                "html_length": len(page.content()),
            }))
            raise
        finally:
            browser.close()
    summary = [{"server": item["server"], "total_players": item["total_players"],
                "active_players": item["active_players"], "total_guilds": item["total_guilds"],
                "active_guilds": item["active_guilds"], "classes": len(item["classes"]),
                "class_total": sum(row["player_count"] for row in item["classes"])} for item in payload]
    if os.getenv("DRY_RUN", "0") == "1":
        print(json.dumps({"ok": True, "dry_run": True, "summary": summary}))
        return
    post(payload); print(json.dumps({"ok": True, "summary": summary}))


if __name__ == "__main__": main()
