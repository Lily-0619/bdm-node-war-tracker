/** 週次ボードの組み立て。開催のない曜日はそもそも行を作らない。 */
import {
  BattleRow, GuildRow, InitialRow, Ledger, NodeRow, TIER_LABEL, WEEKDAY_JA,
  WEEKDAY_OFFSET, WEEKDAY_ORDER, addDays, clamp0, daysBetween, heatClass,
  tierRank, weekStart,
} from "./calc";

export interface BoardRow {
  nodeId: number; name: string; tier: string; tierLabel: string;
  timeCode: number | null; fortress: boolean; capacity: number | null;
  bidSlots: number | null; slot: string; isCastle: boolean;
  battleId: number | null; unified: boolean; banquet: boolean;
  winnerGuildId: number | null;
  participants: { guildId: number; name: string; position: number }[];
  eligible: number[];
  vacancyDays: number | null; heat: string;
  holder: string; holdingDays: number | null; isVacant: boolean;
  /** 前週の対戦がまだ行われていないため、保有ギルドが決まっていない */
  isUndetermined: boolean;
}

export interface BoardDay {
  weekday: string; weekdayJa: string; date: string; dateShort: string;
  isCastleDay: boolean; isToday: boolean; count: number; done: number;
  rows: BoardRow[];
}

export interface Week { monday: string; sunday: string; label: string; days: BoardDay[]; }

function weekDates(monday: string): Record<string, string> {
  const keys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const out: Record<string, string> = {};
  keys.forEach((k, i) => { out[k] = addDays(monday, i); });
  return out;
}

export function buildWeek(
  monday: string,
  ledger: Ledger,
  nodes: NodeRow[],
  battles: BattleRow[],
  participants: { battle_id: number; guild_id: number; position: number; name: string }[],
  activeGuildIds: Set<number>,
  /** 実際の今日。前週の対戦がまだ行われていない拠点を「未定」にするために使う */
  realToday?: string,
): Week {
  const dates = weekDates(monday);

  const byWeekday = new Map<string, NodeRow[]>();
  for (const n of nodes) {
    if (!n.active) continue;
    const d = dates[n.weekday];
    if (!d) continue;
    if (n.effective_from && n.effective_from > d) continue;   // まだ有効になっていない
    if (!byWeekday.has(n.weekday)) byWeekday.set(n.weekday, []);
    byWeekday.get(n.weekday)!.push(n);
  }
  // 等級 3 → 2 → 1（城は単独）→ 枠名
  for (const list of byWeekday.values()) {
    list.sort((a, b) => {
      const r = tierRank(b.tier) - tierRank(a.tier);
      return r !== 0 ? r : a.slot < b.slot ? -1 : a.slot > b.slot ? 1 : 0;
    });
  }

  const battleByKey = new Map<string, BattleRow>();
  for (const b of battles) battleByKey.set(`${b.battle_date}_${b.node_id}`, b);

  const partsByBattle = new Map<number, { guildId: number; name: string; position: number }[]>();
  for (const p of participants) {
    if (!partsByBattle.has(p.battle_id)) partsByBattle.set(p.battle_id, []);
    partsByBattle.get(p.battle_id)!.push({ guildId: p.guild_id, name: p.name, position: p.position });
  }
  for (const list of partsByBattle.values()) {
    list.sort((a, b) => (a.position - b.position) || (a.name < b.name ? -1 : 1));
  }

  const days: BoardDay[] = [];
  for (const wk of WEEKDAY_ORDER) {
    const nodeRows = byWeekday.get(wk);
    if (!nodeRows || !nodeRows.length) continue;
    const d = dates[wk];
    const rows: BoardRow[] = [];
    let done = 0;

    for (const node of nodeRows) {
      const b = battleByKey.get(`${d}_${node.id}`);
      const st = ledger.state(node.id);
      const occ = b ? ledger.battleResult.get(b.id) : undefined;
      if (b && b.winner_guild_id) done++;
      // 保有日数・税は「この日の対戦時点」で測る。週の中で結果が出ても動かない。
      //   空席なら 税 = 空席になった日 → この日の対戦（勝てば手に入る空席日数）
      //   保有中なら 税 = そのギルドが取ったときの空席日数（実績値のまま）
      const vacancy = st.holderGuildId === null
        ? clamp0(daysBetween(d, st.vacantSince))
        : st.vacancyDaysNow;
      const holdDays = st.holderGuildId === null
        ? null
        : clamp0(daysBetween(d, st.heldSince));
      // 保有ギルドは「前週の対戦で勝ったギルド」。その対戦がまだ行われていなければ未定。
      const prevScheduled = addDays(monday, (WEEKDAY_OFFSET[node.weekday] ?? 0) - 7);
      const undetermined = !!realToday && prevScheduled > realToday;
      rows.push({
        nodeId: node.id, name: node.name, tier: node.tier,
        tierLabel: TIER_LABEL[node.tier] ?? node.tier,
        timeCode: node.time_code, fortress: !!node.fortress,
        capacity: node.capacity, bidSlots: node.bid_slots, slot: node.slot,
        isCastle: node.tier === "castle",
        battleId: b ? b.id : null,
        unified: b ? !!b.unified : false,
        banquet: b ? !!b.banquet : false,
        winnerGuildId: b ? b.winner_guild_id : null,
        participants: b ? (partsByBattle.get(b.id) ?? []) : [],
        eligible: ledger.eligibleGuildIds(node.id, activeGuildIds),
        vacancyDays: undetermined ? null : vacancy,
        heat: heatClass(undetermined ? null : vacancy),
        holder: undetermined ? "" : st.holderName,
        holdingDays: undetermined ? null : holdDays,
        isVacant: !undetermined && st.holderGuildId === null,
        isUndetermined: undetermined,
      });
    }

    days.push({
      weekday: wk, weekdayJa: WEEKDAY_JA[wk], date: d,
      dateShort: d.slice(5), isCastleDay: wk === "sat",
      isToday: d === (realToday ?? ledger.today), count: rows.length, done, rows,
    });
  }

  const sunday = addDays(monday, 6);
  return { monday, sunday, label: `${monday}（月） 〜 ${sunday.slice(5)}（日）`, days };
}

export function holdingSummary(ledger: Ledger) {
  const order = ["castle", "3", "2", "1"];
  const buckets: Record<string, { total: number; held: number }> = {};
  for (const t of order) buckets[t] = { total: 0, held: 0 };
  for (const [nodeId, st] of ledger.states) {
    const tier = ledger.nodeById.get(nodeId)!.tier;
    if (!buckets[tier]) continue;
    buckets[tier].total++;
    if (st.holderGuildId) buckets[tier].held++;
  }
  return order.map((t) => ({
    tier: t, tierLabel: TIER_LABEL[t],
    total: buckets[t].total, held: buckets[t].held,
    vacant: buckets[t].total - buckets[t].held,
  }));
}

export { weekStart };
