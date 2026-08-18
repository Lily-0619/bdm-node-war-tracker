/**
 * すべてのデータを1つのExcelにまとめて書き出す。
 * D1の内容からその場で生成するので、ダウンロードした時点の最新が必ず入る。
 *
 * シート構成
 *   今週の記録    … 現在の週の拠点戦・攻城戦を1戦1行で（週次ボードと同じ項目、税・保有日数あり）
 *   過去の記録    … 現在より前の週の記録（税・保有日数の列は含まない＝別途保存）
 *   税収ランキング … 空席日数が長い順（常に最新）
 *   保有状況      … 等級ごとの保有/空席と、拠点ごとの現保有ギルド（常に最新）
 *   拠点マスタ / ギルド一覧
 */
import { holdingSummary } from "./board";
import {
  BattleRow, Ledger, NodeRow, TIER_LABEL, WEEKDAY_JA, weekStart, weekdayKey,
} from "./calc";
import { Cell, HEAT_STYLE, S, Sheet, WEEKDAY_STYLE, WEEKDAY_STYLE_CENTER, buildXlsx } from "./xlsx";

type Row = (Cell | string | number | null)[];

// 週次ボード（WEBアプリ）と同じ項目・同じ並び順
const CURRENT_HEADERS = ["曜日", "日付", "拠点名", "等級", "時間", "城塞", "宴会", "統一",
  "現保有", "対戦ギルド", "占領ギルド", "税", "保有日数"];
const PAST_HEADERS = ["曜日", "日付", "拠点名", "等級", "時間", "城塞", "宴会", "統一",
  "現保有", "対戦ギルド", "占領ギルド"];

const WK_RANK: Record<string, number> = { mon: 0, thu: 1, fri: 2, sun: 3, sat: 4 };
function sortNodesForDisplay(nodes: NodeRow[]): NodeRow[] {
  const tr: Record<string, number> = { "1": 1, "2": 2, "3": 3, castle: 4 };
  return [...nodes].sort((a, b) => {
    const w = (WK_RANK[a.weekday] ?? 9) - (WK_RANK[b.weekday] ?? 9);
    if (w !== 0) return w;
    const d = (tr[b.tier] ?? 0) - (tr[a.tier] ?? 0);
    if (d !== 0) return d;
    return a.slot < b.slot ? -1 : a.slot > b.slot ? 1 : 0;
  });
}

/**
 * 運用開始時、最初の1回だけ入力する「今どこを誰が持っているか」のCSVテンプレート。
 * これをまなが埋めて /api/initial-holding/import に貼り付けると initial_holdings に取り込まれる。
 * それ以降は週次ボードの入力がそのまま反映されるので、この作業は最初の1回だけでよい。
 */
export function initialHoldingsTemplateCsv(nodes: NodeRow[]): string {
  const lines = ["曜日,拠点名,等級,現保有ギルド,獲得日(YYYY-MM-DD),前回放棄日(YYYY-MM-DD)"];
  for (const n of sortNodesForDisplay(nodes)) {
    lines.push([WEEKDAY_JA[n.weekday] ?? n.weekday, n.name, TIER_LABEL[n.tier] ?? n.tier, "", "", ""].join(","));
  }
  return lines.join("\n");
}

export interface ExportInput {
  ledger: Ledger;
  nodes: NodeRow[];
  guilds: { id: number; name: string; note: string; active: number }[];
  battles: BattleRow[];
  participants: { battle_id: number; guild_id: number; position: number; name: string }[];
  startDate: string;
  today: string;
}

export function fullWorkbook(inp: ExportInput): Uint8Array {
  const { ledger, nodes, guilds, battles, participants } = inp;
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const partsByBattle = new Map<number, string[]>();
  for (const p of [...participants].sort((a, b) => a.position - b.position)) {
    if (!partsByBattle.has(p.battle_id)) partsByBattle.set(p.battle_id, []);
    partsByBattle.get(p.battle_id)!.push(p.name);
  }

  const sorted = [...battles].sort((a, b) =>
    a.battle_date === b.battle_date ? a.node_id - b.node_id
      : a.battle_date < b.battle_date ? -1 : 1);

  const currentWeek = weekStart(inp.today);

  function battleRow(b: BattleRow, node: NodeRow, includeTaxHold: boolean): Row {
    const wd = weekdayKey(b.battle_date);
    const cellS = WEEKDAY_STYLE[wd] ?? S.CELL;
    const centerS = WEEKDAY_STYLE_CENTER[wd] ?? S.CENTER;
    const base: Row = [
      { v: WEEKDAY_JA[wd], s: centerS },
      { v: b.battle_date, s: cellS },
      { v: node.name, s: cellS },
      { v: TIER_LABEL[node.tier] ?? node.tier, s: centerS },
      { v: node.time_code ?? "", s: centerS },
      { v: node.fortress ? "城塞" : "", s: centerS },
      { v: b.banquet ? "宴会" : "", s: centerS },
      { v: b.unified ? "統一" : "", s: centerS },
      { v: ledger.state(b.node_id).holderName || "（空席）", s: cellS },
      { v: (partsByBattle.get(b.id) ?? []).join("、"), s: cellS },
      { v: b.winner_guild_id ? ledger.guildNames.get(b.winner_guild_id) ?? "" : "", s: cellS },
    ];
    if (!includeTaxHold) return base;
    const occ = ledger.battleResult.get(b.id);
    const st = ledger.state(b.node_id);
    const vacancy = occ ? occ.vacancyDays : st.vacancyDaysNow;
    const heat = vacancy === null ? "heat0"
      : vacancy >= 21 ? "heat5" : vacancy >= 14 ? "heat4"
        : vacancy >= 10 ? "heat3" : vacancy >= 6 ? "heat2" : vacancy >= 1 ? "heat1" : "heat0";
    base.push({ v: vacancy ?? "", s: HEAT_STYLE[heat] ?? S.RIGHT });
    base.push({ v: occ ? occ.holdingDays ?? "" : st.holdingDays ?? "", s: S.RIGHT });
    return base;
  }

  // ---------------- 今週の記録 ----------------
  const curRows: Row[] = [];
  curRows.push([{ v: `今週の記録（${currentWeek} の週）`, s: S.TITLE }]);
  curRows.push([{
    v: "週次ボードと同じ項目。税＝空席日数（前回の放棄日→今回の獲得日）。長いほど勝ったときの利益が大きい。",
    s: S.NOTE,
  }]);
  curRows.push([]);
  curRows.push(CURRENT_HEADERS.map((h) => ({ v: h, s: S.HEADER })));
  let curCount = 0;
  for (const b of sorted) {
    const node = nodeById.get(b.node_id);
    if (!node) continue;
    if (weekStart(b.battle_date) !== currentWeek) continue;
    curRows.push(battleRow(b, node, true));
    curCount++;
  }
  if (!curCount) curRows.push([{ v: "今週はまだ記録がありません。", s: S.CELL }]);
  const currentSheet: Sheet = {
    name: "今週の記録", rows: curRows, freezeRows: 4,
    cols: [6, 12, 22, 6, 6, 6, 6, 6, 20, 34, 18, 6, 10],
  };

  // ---------------- 過去の記録（税・保有日数を除いた別保存） ----------------
  const pastRows: Row[] = [];
  pastRows.push([{ v: "過去の記録（現在の週より前・税と保有日数は含まない）", s: S.TITLE }]);
  pastRows.push([]);
  pastRows.push(PAST_HEADERS.map((h) => ({ v: h, s: S.HEADER })));
  let lastWeek = "";
  let pastCount = 0;
  for (const b of sorted) {
    const node = nodeById.get(b.node_id);
    if (!node) continue;
    const wk = weekStart(b.battle_date);
    if (wk === currentWeek || wk > currentWeek) continue;
    if (wk !== lastWeek) {
      lastWeek = wk;
      const bar: Cell[] = [{ v: `${wk} の週`, s: S.DAY }];
      for (let c = 1; c < PAST_HEADERS.length; c++) bar.push({ v: null, s: S.DAY });
      pastRows.push(bar);
    }
    pastRows.push(battleRow(b, node, false));
    pastCount++;
  }
  if (!pastCount) pastRows.push([{ v: "過去の記録はまだありません。", s: S.CELL }]);
  const pastSheet: Sheet = {
    name: "過去の記録", rows: pastRows, freezeRows: 3,
    cols: [6, 12, 22, 6, 6, 6, 6, 6, 20, 34, 18],
  };

  // ---------------- 税収ランキング ----------------
  const rank: Row[] = [];
  rank.push([{ v: "空席日数が長い順（＝勝ったときの利益が大きい順）", s: S.TITLE }]);
  rank.push([]);
  rank.push(["順位", "拠点", "級", "開催曜日", "現保有ギルド", "空席日数"].map((h) => ({ v: h, s: S.HEADER })));
  ledger.taxRanking().forEach((item, i) => {
    const node = nodeById.get(item.nodeId)!;
    const heat = item.vacancyDays === null ? "heat0"
      : item.vacancyDays >= 21 ? "heat5" : item.vacancyDays >= 14 ? "heat4"
        : item.vacancyDays >= 10 ? "heat3" : item.vacancyDays >= 6 ? "heat2"
          : item.vacancyDays >= 1 ? "heat1" : "heat0";
    rank.push([
      { v: i + 1, s: S.CENTER },
      { v: item.name, s: S.CELL },
      { v: item.tierLabel, s: S.CENTER },
      { v: WEEKDAY_JA[node.weekday] ?? "", s: S.CENTER },
      { v: item.holder || "（空席）", s: S.CELL },
      { v: item.vacancyDays ?? "", s: HEAT_STYLE[heat] ?? S.RIGHT },
    ]);
  });
  const rankSheet: Sheet = { name: "税収ランキング", rows: rank, cols: [6, 24, 6, 10, 20, 12], freezeRows: 3 };

  // ---------------- 保有状況 ----------------
  const hold: Row[] = [];
  hold.push([{ v: "等級ごとの保有状況", s: S.TITLE }]);
  hold.push([]);
  hold.push(["等級", "拠点数", "保有中", "空席"].map((h) => ({ v: h, s: S.HEADER })));
  for (const s of holdingSummary(ledger)) {
    hold.push([
      { v: s.tierLabel, s: S.CENTER }, { v: s.total, s: S.CENTER },
      { v: s.held, s: S.CENTER }, { v: s.vacant, s: S.CENTER },
    ]);
  }
  hold.push([]);
  hold.push([{ v: "拠点ごとの現保有ギルド", s: S.TITLE }]);
  hold.push([]);
  hold.push(["曜日", "枠", "拠点", "級", "現保有ギルド", "保有日数", "空席になった日"]
    .map((h) => ({ v: h, s: S.HEADER })));
  const wkRank: Record<string, number> = { mon: 0, thu: 1, fri: 2, sun: 3, sat: 4 };
  const ordered = [...ledger.states.values()].sort((a, b) => {
    const na = nodeById.get(a.nodeId)!, nb = nodeById.get(b.nodeId)!;
    const w = (wkRank[na.weekday] ?? 9) - (wkRank[nb.weekday] ?? 9);
    if (w !== 0) return w;
    return na.slot < nb.slot ? -1 : na.slot > nb.slot ? 1 : 0;
  });
  for (const st of ordered) {
    const n = nodeById.get(st.nodeId)!;
    hold.push([
      { v: WEEKDAY_JA[n.weekday] ?? "", s: S.CENTER },
      { v: n.slot, s: S.CENTER },
      { v: n.name, s: S.CELL },
      { v: TIER_LABEL[n.tier] ?? n.tier, s: S.CENTER },
      { v: st.holderName || "（空席）", s: S.CELL },
      { v: st.holdingDays ?? "", s: S.RIGHT },
      { v: st.vacantSince ?? "", s: S.CENTER },
    ]);
  }
  const holdSheet: Sheet = { name: "保有状況", rows: hold, cols: [8, 8, 22, 6, 20, 10, 16] };

  // ---------------- マスタ ----------------
  const nm: Row[] = [];
  nm.push(["曜日", "枠", "拠点名", "等級", "時刻", "城塞", "人数", "枠数", "拠点効果", "適用開始日", "有効"]
    .map((h) => ({ v: h, s: S.HEADER })));
  const nsorted = [...nodes].sort((a, b) => {
    const w = (wkRank[a.weekday] ?? 9) - (wkRank[b.weekday] ?? 9);
    if (w !== 0) return w;
    const t = (TIER_LABEL[b.tier] ? 0 : 0);
    const tr = ({ "1": 1, "2": 2, "3": 3, castle: 4 } as Record<string, number>);
    const d = (tr[b.tier] ?? 0) - (tr[a.tier] ?? 0);
    return d !== 0 ? d + t : a.slot < b.slot ? -1 : a.slot > b.slot ? 1 : 0;
  });
  for (const n of nsorted) {
    nm.push([
      { v: WEEKDAY_JA[n.weekday] ?? n.weekday, s: S.CENTER },
      { v: n.slot, s: S.CENTER },
      { v: n.name, s: S.CELL },
      { v: TIER_LABEL[n.tier] ?? n.tier, s: S.CENTER },
      { v: n.time_code ?? "", s: S.CENTER },
      { v: n.fortress ? "城塞" : "", s: S.CENTER },
      { v: n.capacity ?? "", s: S.CENTER },
      { v: n.bid_slots ?? "", s: S.CENTER },
      { v: n.effect, s: S.CELL },
      { v: n.effective_from, s: S.CENTER },
      { v: n.active ? "有効" : "無効", s: S.CENTER },
    ]);
  }
  const nodeSheet: Sheet = {
    name: "拠点マスタ", rows: nm, freezeRows: 1,
    cols: [8, 8, 22, 6, 8, 8, 8, 8, 22, 14, 8],
  };

  const gm: Row[] = [];
  gm.push(["ギルド名", "メモ", "現保有拠点", "級", "有効"].map((h) => ({ v: h, s: S.HEADER })));
  const heldNode = ledger.guildHeldNode();
  for (const g of [...guilds].sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const nId = heldNode.get(g.id);
    const n = nId ? nodeById.get(nId) : undefined;
    gm.push([
      { v: g.name, s: S.CELL },
      { v: g.note, s: S.CELL },
      { v: n ? n.name : "", s: S.CELL },
      { v: n ? TIER_LABEL[n.tier] ?? n.tier : "", s: S.CENTER },
      { v: g.active ? "有効" : "無効", s: S.CENTER },
    ]);
  }
  const guildSheet: Sheet = { name: "ギルド一覧", rows: gm, cols: [24, 18, 22, 6, 8], freezeRows: 1 };

  return buildXlsx([currentSheet, pastSheet, rankSheet, holdSheet, nodeSheet, guildSheet]);
}
