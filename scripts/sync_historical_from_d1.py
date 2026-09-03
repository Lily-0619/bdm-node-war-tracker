#!/usr/bin/env python3
"""D1(kyoten)の確定済み対戦結果をdata/historical/*.mdへ反映する。

使い方:
    npx wrangler d1 execute kyoten --remote \
        --command "..." --json > /tmp/battles.json
    python scripts/sync_historical_from_d1.py /tmp/battles.json

--query-and-run を付けると、wrangler呼び出しから一括で行う
(CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID が環境変数にある前提):
    python scripts/sync_historical_from_d1.py --query-and-run

冪等: 既に記録済みの日付はスキップする。日付キーで重複除去もする。
"""
import argparse
import json
import os
import re
import subprocess
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HIST_DIR = os.path.join(REPO_ROOT, "data", "historical")

QUERY = """
SELECT battle_date, node_name, winner_name,
       GROUP_CONCAT(guild_name, '||') AS participants
FROM (
  SELECT b.id, b.battle_date, n.name AS node_name, w.name AS winner_name,
         g.name AS guild_name
  FROM battles b
  JOIN nodes n ON n.id = b.node_id
  LEFT JOIN guilds w ON w.id = b.winner_guild_id
  LEFT JOIN battle_participants bp ON bp.battle_id = b.id
  LEFT JOIN guilds g ON g.id = bp.guild_id
  WHERE b.winner_guild_id IS NOT NULL
  ORDER BY b.id, bp.position
)
GROUP BY id
ORDER BY battle_date, node_name
""".strip()


def run_query() -> list:
    npx = "npx.cmd" if os.name == "nt" else "npx"
    flat_query = " ".join(QUERY.split())
    result = subprocess.run(
        [npx, "wrangler", "d1", "execute", "kyoten", "--remote",
         "--command", flat_query, "--json"],
        cwd=REPO_ROOT, capture_output=True, text=True,
        shell=(os.name == "nt"), encoding="utf-8", errors="replace",
    )
    if result.returncode != 0:
        print(result.stdout, file=sys.stderr)
        print(result.stderr, file=sys.stderr)
        result.check_returncode()
    data = json.loads(result.stdout)
    return data[0]["results"]


def build_name_map(files: list) -> dict:
    def strip(f):
        n = f[:-3]
        m = re.match(r"^[FMST]-T[123](.+)$", n)
        return m.group(1) if m else n

    key_to_file = {strip(f): f for f in files}
    name_to_key = {k: k for k in key_to_file}
    # D1側とhistorical側でファイル名の表記が異なるものだけ個別マッピング
    name_to_key["アルティノ入り口"] = "アルティノ入口"
    name_to_key["カルフェオン"] = "カルフェオン攻城戦"
    name_to_key["バレンシア"] = "バレンシア攻城戦"
    return {n: key_to_file[k] for n, k in name_to_key.items() if k in key_to_file}


def merge(rows: list) -> list:
    """戻り値: [(filename, 追加件数, [追加日付...]), ...]"""
    files = sorted(f for f in os.listdir(HIST_DIR) if f.endswith(".md") and f != "README.md")
    name_to_file = build_name_map(files)

    by_node = {}
    for r in rows:
        by_node.setdefault(r["node_name"], []).append(r)

    unmatched = sorted(set(by_node) - set(name_to_file))
    if unmatched:
        print(f"警告: historicalに対応ファイルが無い拠点名: {unmatched}", file=sys.stderr)

    report = []
    for node_name, entries in by_node.items():
        fname = name_to_file.get(node_name)
        if not fname:
            continue
        fpath = os.path.join(HIST_DIR, fname)
        existing_lines = [l.rstrip("\n") for l in open(fpath, encoding="utf-8") if l.strip()]
        combined = {}
        for l in existing_lines:
            m = re.match(r"^(\d{4}-\d{2}-\d{2})", l)
            if m:
                combined[m.group(1)] = l
        before = set(combined)

        for r in entries:
            date = r["battle_date"]
            if date in before:
                continue
            winner = r["winner_name"]
            parts = (r["participants"] or "").split("||") if r["participants"] else []
            losers = [x for x in parts if x != winner]
            combined[date] = f"{date}　W {winner}　L {', '.join(losers)}"

        added = sorted(set(combined) - before)
        if not added and len(combined) == len(existing_lines):
            continue

        ordered = [combined[d] for d in sorted(combined.keys(), reverse=True)]
        with open(fpath, "w", encoding="utf-8", newline="\n") as f:
            f.write("\n".join(ordered) + "\n")
        report.append((fname, len(added), added))

    return report


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("json_file", nargs="?", help="wrangler --jsonの出力ファイル。省略時は--query-and-runが必要")
    ap.add_argument("--query-and-run", action="store_true", help="wranglerを直接呼び出してから反映する")
    args = ap.parse_args()

    if args.query_and_run or not args.json_file:
        rows = run_query()
    else:
        data = json.load(open(args.json_file, encoding="utf-8"))
        rows = data[0]["results"]

    report = merge(rows)
    total = sum(c for _, c, _ in report)
    print(f"追加件数: {total}")
    for fname, cnt, dates in report:
        print(f"  {fname}: +{cnt} {dates}")

    # GitHub Actions向け: 変更有無をoutputへ
    gh_out = os.environ.get("GITHUB_OUTPUT")
    if gh_out:
        with open(gh_out, "a", encoding="utf-8") as f:
            f.write(f"changed={'true' if total else 'false'}\n")


if __name__ == "__main__":
    main()
