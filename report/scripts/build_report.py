#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""data/historical/*.md を集計し、report/output/ にExcelレポートを出力する。

使い方:
    python report/scripts/build_report.py

data/historicalが更新されるたびに再実行すれば、常に最新の集計に更新される。
GitHub Actions (.github/workflows/sync-historical.yml) からも呼ばれる。
"""
import os
import re
import sys
import itertools
from collections import defaultdict, Counter

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HIST_DIR = os.path.join(REPO_ROOT, "data", "historical")
OUT_PATH = os.path.join(REPO_ROOT, "report", "output", "拠点戦_過去データ分析.xlsx")

FONT = "Arial"
HEADER_FILL = PatternFill("solid", fgColor="1F3864")
HEADER_FONT = Font(name=FONT, bold=True, color="FFFFFF")
TITLE_FONT = Font(name=FONT, bold=True, size=14)
NOTE_FONT = Font(name=FONT, italic=True, size=9, color="666666")
BASE_FONT = Font(name=FONT)

SENTINELS = {"Draw", "No Bidder", "x", ""}
NWAY_LABEL = {1: "不戦勝(単独)", 2: "タイマン", 3: "三つ巴", 4: "四つ巴", 5: "五つ巴", 6: "六つ巴"}


def nway_label(n):
    return NWAY_LABEL.get(n, f"{n}人乱戦")


def style_header(ws, row=1, ncols=1):
    for c in range(1, ncols + 1):
        cell = ws.cell(row=row, column=c)
        cell.font = HEADER_FONT
        cell.fill = HEADER_FILL
        cell.alignment = Alignment(horizontal="center")
    ws.freeze_panes = ws.cell(row=row + 1, column=1).coordinate


def autosize(ws, widths):
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w


def write_table(ws, headers, rows, start_row=1, widths=None):
    for j, h in enumerate(headers, start=1):
        ws.cell(row=start_row, column=j, value=h)
    style_header(ws, start_row, len(headers))
    for i, row in enumerate(rows, start=start_row + 1):
        for j, v in enumerate(row, start=1):
            ws.cell(row=i, column=j, value=v).font = BASE_FONT
    if widths:
        autosize(ws, widths)


def strip_prefix(fname):
    n = fname[:-3]
    m = re.match(r"^([FMST])-T([123])(.+)$", n)
    if m:
        return m.group(3), m.group(1), int(m.group(2))
    return n, "SIEGE", 0


def load_records():
    records = []
    files = sorted(f for f in os.listdir(HIST_DIR) if f.endswith(".md") and f != "README.md")
    for fname in files:
        node_key, cat, tierlbl = strip_prefix(fname)
        for line in open(os.path.join(HIST_DIR, fname), encoding="utf-8"):
            line = line.strip()
            if not line:
                continue
            m = re.match(r"^(\d{4}-\d{2}-\d{2})　W\s(.*?)　L\s(.*)$", line)
            if not m:
                continue
            date, winner, losers_raw = m.groups()
            losers = [x.strip() for x in losers_raw.split(",") if x.strip()]
            records.append({"date": date, "node": node_key, "cat": cat, "tier": tierlbl,
                             "winner": winner.strip(), "losers": losers})

    n_draw = sum(1 for r in records if r["winner"] == "Draw")
    n_nobidder = sum(1 for r in records for l in r["losers"] if l == "No Bidder")
    for r in records:
        r["losers"] = [l for l in r["losers"] if l not in SENTINELS]
    records = [r for r in records if r["winner"] not in SENTINELS]
    return records, n_draw, n_nobidder


def build():
    records, n_draw, n_nobidder = load_records()
    dates = sorted({r["date"] for r in records})

    part_rows = []
    for r in records:
        part_rows.append((r["date"], r["node"], r["winner"], 1))
        for l in r["losers"]:
            part_rows.append((r["date"], r["node"], l, 0))

    guild_battles = defaultdict(int)
    guild_wins = defaultdict(int)
    guild_nodes = defaultdict(Counter)
    guild_uncontested = Counter()
    for r in records:
        if not r["losers"]:
            guild_uncontested[r["winner"]] += 1
    for date, node, guild, win in part_rows:
        guild_battles[guild] += 1
        guild_wins[guild] += win
        guild_nodes[guild][node] += 1

    pair_counter = Counter()
    opponent_set = defaultdict(set)
    pair_result = defaultdict(Counter)
    for r in records:
        participants = sorted(set([r["winner"]] + r["losers"]))
        for a, b in itertools.combinations(participants, 2):
            pair_counter[(a, b)] += 1
            opponent_set[a].add(b)
            opponent_set[b].add(a)
            if r["winner"] == a:
                pair_result[(a, b)]["a_win"] += 1
            elif r["winner"] == b:
                pair_result[(a, b)]["b_win"] += 1

    def ym(d):
        return d[:7]

    guild_month = defaultdict(Counter)
    for date, node, guild, win in part_rows:
        guild_month[guild][ym(date)] += 1
    all_months = sorted({ym(d) for d in dates})

    node_guild = defaultdict(Counter)
    for date, node, guild, win in part_rows:
        node_guild[node][guild] += 1
    node_wins = defaultdict(Counter)
    for r in records:
        node_wins[r["node"]][r["winner"]] += 1

    # ---- N人巴(タイマン〜五つ巴)分析 ----
    size_counter = Counter()
    combo_counter = defaultdict(Counter)   # size -> frozenset(participants) -> count
    combo_winners = defaultdict(lambda: defaultdict(Counter))  # size -> combo -> winner -> count
    for r in records:
        participants = frozenset([r["winner"]] + r["losers"])
        n = len(participants)
        size_counter[n] += 1
        combo_counter[n][participants] += 1
        combo_winners[n][participants][r["winner"]] += 1

    # ---------------- workbook ----------------
    wb = openpyxl.Workbook()

    ws = wb.active
    ws.title = "サマリー"
    ws["A1"] = "拠点戦 過去データ分析レポート"
    ws["A1"].font = TITLE_FONT
    meta = [
        ("対象期間", f"{dates[0]} 〜 {dates[-1]}"),
        ("対象レコード数(1拠点1戦=1件)", len(records)),
        ("延べギルド数(表記ゆれ含む可能性あり)", len(guild_battles)),
        ("データソース", "data/historical/*.md (2025-08〜2026-08-16は旧Excel由来、2026-08-17以降はD1本番データ。毎日自動同期)"),
        ("除外した特殊値", f"winner='Draw'(判定不能): {n_draw}件 / loser内'No Bidder'(不戦勝枠): {n_nobidder}件"),
        ("含まれていないデータ", "各ギルドの戦闘力(CPM)。別ツールで作成後、実力差では説明できない勝敗の抽出に使う予定。"),
        ("更新方法", "python report/scripts/build_report.py を再実行(GitHub Actionsで自動実行)"),
    ]
    row = 3
    for label, value in meta:
        ws.cell(row=row, column=1, value=label).font = Font(name=FONT, bold=True)
        c = ws.cell(row=row, column=2, value=value)
        c.font = BASE_FONT
        c.alignment = Alignment(wrap_text=True)
        ws.row_dimensions[row].height = 30
        row += 2
    autosize(ws, [26, 90])

    # --- ギルド別成績 ---
    ws2 = wb.create_sheet("ギルド別成績")
    rows = []
    for g, cnt in sorted(guild_battles.items(), key=lambda x: -x[1]):
        w = guild_wins[g]
        rows.append([g, cnt, w, round(w / cnt, 4), len(guild_nodes[g]), len(opponent_set[g]),
                     guild_uncontested.get(g, 0)])
    write_table(ws2, ["ギルド名", "参加数", "勝利数", "勝率", "参加拠点数", "対戦相手数(延べ人数)", "無競争勝利数"],
                rows, widths=[24, 10, 10, 10, 12, 16, 12])
    for i in range(2, len(rows) + 2):
        ws2.cell(row=i, column=4).number_format = "0.0%"

    # --- 頻出対戦ペア ---
    ws3 = wb.create_sheet("頻出対戦ペア")
    pair_rows = []
    for (a, b), cnt in sorted(pair_counter.items(), key=lambda x: -x[1])[:200]:
        c = pair_result[(a, b)]
        pair_rows.append([a, b, cnt, c.get("a_win", 0), c.get("b_win", 0)])
    write_table(ws3, ["ギルドA", "ギルドB", "対戦回数(乱戦内の組み合わせ含む)", "A勝利数", "B勝利数"], pair_rows,
                widths=[22, 22, 14, 10, 10])

    # --- 偏った対戦結果 ---
    ws4 = wb.create_sheet("偏った対戦結果(要確認)")
    lop_rows = []
    for (a, b), c in pair_result.items():
        total = c.get("a_win", 0) + c.get("b_win", 0)
        if total >= 5:
            rate_a = c.get("a_win", 0) / total
            if rate_a >= 0.8 or rate_a <= 0.2:
                dominant = a if rate_a >= 0.8 else b
                lop_rows.append([a, b, total, c.get("a_win", 0), c.get("b_win", 0), dominant,
                                  round(max(rate_a, 1 - rate_a), 3)])
    lop_rows.sort(key=lambda x: (-x[6], -x[2]))
    write_table(ws4, ["ギルドA", "ギルドB", "対戦回数", "A勝利数", "B勝利数", "ほぼ独占している側", "独占率"],
                lop_rows, widths=[22, 22, 10, 10, 10, 20, 10])
    for i in range(2, len(lop_rows) + 2):
        ws4.cell(row=i, column=7).number_format = "0.0%"
    ws4["I1"] = "注記: 統計的な偏りの検出であり、談合の証明ではありません。実力差・縄張り(縁のある拠点)・アライアンス内の暗黙の棲み分け等でも同様のパターンが生じます。"
    ws4["I1"].font = NOTE_FONT
    ws4.column_dimensions["I"].width = 60
    ws4["I1"].alignment = Alignment(wrap_text=True)

    # --- N人巴 集計 ---
    ws8 = wb.create_sheet("戦闘形式別集計")
    total = sum(size_counter.values())
    size_rows = []
    for n in sorted(size_counter):
        cnt = size_counter[n]
        size_rows.append([nway_label(n), n, cnt, round(cnt / total, 4)])
    write_table(ws8, ["形式", "参加ギルド数", "戦闘回数", "全体に占める割合"], size_rows,
                widths=[16, 12, 12, 14])
    for i in range(2, len(size_rows) + 2):
        ws8.cell(row=i, column=4).number_format = "0.0%"
    ws8["F1"] = "注記: 参加ギルド数は各拠点のmax_battle_count(表示上限)に制限されており、実際の入札ギルド数そのものではありません。"
    ws8["F1"].font = NOTE_FONT
    ws8.column_dimensions["F"].width = 60
    ws8["F1"].alignment = Alignment(wrap_text=True)

    # --- N人巴 頻出組み合わせ ---
    ws9 = wb.create_sheet("N人巴_頻出組み合わせ")
    combo_rows = []
    for n in sorted(combo_counter):
        if n < 2:
            continue
        for combo, cnt in combo_counter[n].most_common():
            if cnt < 2:
                continue
            winners = combo_winners[n][combo]
            win_str = ", ".join(f"{g}:{c}勝" for g, c in winners.most_common())
            combo_rows.append([nway_label(n), n, "、".join(sorted(combo)), cnt, win_str])
    combo_rows.sort(key=lambda x: (x[1], -x[3]))
    write_table(ws9, ["形式", "参加ギルド数", "ギルドの組み合わせ", "出現回数", "内訳(誰が何回勝ったか)"],
                combo_rows, widths=[12, 12, 55, 10, 55])
    for i in range(2, len(combo_rows) + 2):
        ws9.cell(row=i, column=3).alignment = Alignment(wrap_text=True)
        ws9.cell(row=i, column=5).alignment = Alignment(wrap_text=True)
    ws9["G1"] = "同じ拠点で同じ顔ぶれが繰り返し対戦しているケースを抽出(2回以上)。出現回数が多く、かつ内訳が特定ギルドに偏っているものほど要確認。"
    ws9["G1"].font = NOTE_FONT
    ws9.column_dimensions["G"].width = 60
    ws9["G1"].alignment = Alignment(wrap_text=True)

    # --- 月別参加数 ---
    ws5 = wb.create_sheet("月別参加数")
    guild_order = [g for g, _ in sorted(guild_battles.items(), key=lambda x: -x[1])]
    header = ["ギルド名"] + all_months + ["合計"]
    rows5 = []
    for g in guild_order:
        r = [g] + [guild_month[g].get(m, 0) for m in all_months]
        r.append(sum(r[1:]))
        rows5.append(r)
    write_table(ws5, header, rows5, widths=[22] + [9] * len(all_months) + [10])

    # --- 新規参入/離脱 ---
    ws6 = wb.create_sheet("新規参入_離脱")
    half = len(all_months) // 2
    early_months = set(all_months[:half])
    late_months = set(all_months[half:])
    nd_rows = []
    for g, mc in guild_month.items():
        early = sum(v for k, v in mc.items() if k in early_months)
        late = sum(v for k, v in mc.items() if k in late_months)
        if early == 0 and late >= 5:
            nd_rows.append([g, "新規参入(後半のみ)", early, late])
        elif late == 0 and early >= 5:
            nd_rows.append([g, "離脱(前半のみ)", early, late])
    nd_rows.sort(key=lambda x: (x[1], -max(x[2], x[3])))
    write_table(ws6, ["ギルド名", "区分", f"前半参加数({all_months[0]}〜{all_months[half-1]})",
                       f"後半参加数({all_months[half]}〜{all_months[-1]})"], nd_rows,
                widths=[22, 20, 24, 24])

    # --- 拠点別入札状況 ---
    ws7 = wb.create_sheet("拠点別入札状況")
    node_rows = []
    for node in sorted(node_guild.keys()):
        tot = sum(node_guild[node].values())
        top = node_guild[node].most_common(8)
        top_str = ", ".join(f"{g}({c})" for g, c in top)
        win_top = node_wins[node].most_common(5)
        win_str = ", ".join(f"{g}({c}勝)" for g, c in win_top)
        node_rows.append([node, len(node_guild[node]), tot, top_str, win_str])
    write_table(ws7, ["拠点名", "延べ入札ギルド数(ユニーク)", "延べ入札回数", "参加回数上位ギルド", "勝利回数上位ギルド"],
                node_rows, widths=[20, 14, 12, 60, 40])
    for r in range(2, len(node_rows) + 2):
        ws7.cell(row=r, column=4).alignment = Alignment(wrap_text=True)
        ws7.cell(row=r, column=5).alignment = Alignment(wrap_text=True)

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    wb.save(OUT_PATH)
    print(f"saved: {OUT_PATH}")
    print(f"records={len(records)} guilds={len(guild_battles)}")


if __name__ == "__main__":
    build()
