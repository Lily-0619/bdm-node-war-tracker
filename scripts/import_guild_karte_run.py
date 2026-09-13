"""Post the newest collected snapshot for every registered guild to D1."""
from __future__ import annotations

import json
import os
import sqlite3
import urllib.request
from pathlib import Path


RUN_ID = int(os.environ["KARTE_RUN_ID"])
API = os.environ["KARTE_API_BASE"].rstrip("/")
TOKEN = os.environ["KARTE_INGEST_TOKEN"]
DB_PATH = Path(os.environ["KARTE_DB_PATH"])


def request(path: str, payload: dict | None = None) -> dict:
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        API + path, data=data, method="POST" if data is not None else "GET",
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=60) as response:
        return json.load(response)


def main() -> None:
    config = request(f"/api/guild-karte/job-config/{RUN_ID}")
    request(f"/api/guild-karte/progress/{RUN_ID}", {"status": "collecting", "phase": "収集中"})
    if not DB_PATH.exists():
        request(f"/api/guild-karte/progress/{RUN_ID}", {
            "status": "failed", "phase": "収集失敗", "error": "SQLiteが作成されませんでした"})
        raise SystemExit("collector database was not created")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    sent = failed = 0
    for guild_name in config["guilds"]:
        guild = conn.execute(
            "SELECT * FROM guild_snapshots WHERE guild_name=? ORDER BY retrieved_at DESC LIMIT 1", (guild_name,)
        ).fetchone()
        if guild is None:
            failed += 1
            request(f"/api/guild-karte/progress/{RUN_ID}", {
                "failed": True, "guild_name": guild_name, "error": "取得結果がありません"})
            continue
        members = [dict(row) for row in conn.execute(
            "SELECT * FROM member_snapshots WHERE guild_name=? AND retrieved_at=? ORDER BY rank_no",
            (guild_name, guild["retrieved_at"]))]
        summary_row = conn.execute(
            "SELECT * FROM guild_summary_snapshots WHERE guild_name=? AND retrieved_at=?",
            (guild_name, guild["retrieved_at"])).fetchone()
        summary = dict(guild)
        if summary_row:
            summary.update(dict(summary_row))
        payload = {"guild_name": guild_name, "retrieved_at": guild["retrieved_at"],
                   "summary": summary, "members": members}
        request(f"/api/guild-karte/ingest/{RUN_ID}", payload)
        sent += 1
    request(f"/api/guild-karte/progress/{RUN_ID}", {
        "status": "analyzing" if sent else "failed", "phase": "追跡・解析中" if sent else "収集失敗",
        "error": None if not failed else f"{failed}ギルドの取得に失敗"})
    print(json.dumps({"ok": bool(sent), "sent": sent, "failed": failed}))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        try:
            request(f"/api/guild-karte/progress/{RUN_ID}", {
                "status": "failed", "phase": "収集結果の保存失敗", "error": str(exc)[:500]})
        except Exception:
            pass
        raise
