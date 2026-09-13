"""One-time, restartable migration from the legacy guild-card SQLite to D1."""
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


def post(base: str, token: str, path: str, payload: dict | None = None) -> dict:
    data = json.dumps(payload or {}).encode()
    for attempt in range(6):
        req = urllib.request.Request(base.rstrip("/") + path, data=data, method="POST",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json",
                     "User-Agent": "bdm-node-war-tracker/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=90) as response:
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
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser()
    parser.add_argument("sqlite", type=Path)
    parser.add_argument("--api", default=os.getenv("KARTE_API_BASE", ""))
    parser.add_argument("--token", default=os.getenv("KARTE_INGEST_TOKEN", ""))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--start-at", type=int, default=1,
                        help="1-based snapshot number to resume from")
    args = parser.parse_args()
    conn = sqlite3.connect(f"file:{args.sqlite}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    snapshots = conn.execute("SELECT * FROM guild_snapshots ORDER BY retrieved_at,guild_name").fetchall()
    if args.dry_run:
        print(json.dumps({"snapshots": len(snapshots), "guilds": len({r['guild_name'] for r in snapshots}),
                          "first": snapshots[0]["retrieved_at"] if snapshots else None,
                          "last": snapshots[-1]["retrieved_at"] if snapshots else None}, ensure_ascii=False))
        return
    if not args.api or not args.token:
        raise SystemExit("--api and --token (or environment variables) are required")
    run_id = post(args.api, args.token, "/api/guild-karte/import-run")["run_id"]
    if args.start_at < 1 or args.start_at > len(snapshots) + 1:
        raise SystemExit("--start-at is outside the snapshot range")
    for index, guild in enumerate(snapshots, 1):
        if index < args.start_at:
            continue
        members = [dict(row) for row in conn.execute(
            "SELECT * FROM member_snapshots WHERE guild_name=? AND retrieved_at=? ORDER BY rank_no",
            (guild["guild_name"], guild["retrieved_at"]))]
        summary = conn.execute(
            "SELECT * FROM guild_summary_snapshots WHERE guild_name=? AND retrieved_at=?",
            (guild["guild_name"], guild["retrieved_at"])).fetchone()
        combined_summary = dict(guild)
        if summary:
            combined_summary.update(dict(summary))
        payload = {"guild_name": guild["guild_name"], "retrieved_at": guild["retrieved_at"],
                   "summary": combined_summary, "members": members}
        post(args.api, args.token, f"/api/guild-karte/import/{run_id}", payload)
        print(f"[{index}/{len(snapshots)}] {guild['guild_name']} {guild['retrieved_at']}")
    post(args.api, args.token, f"/api/guild-karte/progress/{run_id}",
         {"status": "completed", "phase": "過去データ移行完了"})
    print(json.dumps({"ok": True, "run_id": run_id, "snapshots": len(snapshots)}))


if __name__ == "__main__":
    main()
