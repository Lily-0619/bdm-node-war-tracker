/**
 * 占領状態・空席日数（税）・入札権の計算。
 *
 * 拠点の配置（曜日・枠・等級）が変わってもこのファイルが影響を受けないよう、
 * 入力は「1戦=1レコード」の結果だけに依存させている。
 *
 *   獲得日  … そのギルドがその拠点を取った日
 *   放棄日  … 次のうち早い方
 *              a) その拠点で次に決着がついた日
 *              b) そのギルドが他の拠点で勝った日（＝移動して手放した）
 *   保有日数 … 放棄日（未放棄なら今日） − 獲得日
 *   税(空席日数) … 前回の放棄日 → 今回の獲得日 までの日数。長いほど勝ったときの利益が大きい。
 *
 * 週が変わったとき: その拠点の開催曜日で「前回の開催予定日」を過ぎても勝ったギルドが
 * 記入されていなければ、その開催予定日をもって手放したものとして扱い、空席にする。
 */

export type Tier = "1" | "2" | "3" | "castle";

export const TIER_RANK: Record<string, number> = { "1": 1, "2": 2, "3": 3, castle: 4 };
export const TIER_LABEL: Record<string, string> = { "1": "1", "2": "2", "3": "3", castle: "城" };
export const WEEKDAY_ORDER = ["mon", "thu", "fri", "sat", "sun"] as const;
export const WEEKDAY_JA: Record<string, string> = {
  mon: "月", tue: "火", wed: "水", thu: "木", fri: "金", sat: "土", sun: "日",
};
export const PY_WEEKDAY_KEY = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
/** 月曜日からの日数オフセット。週の切り替わり判定に使う。 */
export const WEEKDAY_OFFSET: Record<string, number> = {
  mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6,
};

export function tierRank(tier: string): number {
  return TIER_RANK[tier] ?? 0;
}

/** 'YYYY-MM-DD' を UTC のミリ秒に。タイムゾーンの影響を受けないよう UTC 固定。 */
export function dayNum(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000;
}

export function fromDayNum(n: number): string {
  return new Date(n * 86400000).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = dayNum(iso);
  if (d === null) return iso;
  return fromDayNum(d + days);
}

/** 月曜日を返す（週の起点） */
export function weekStart(iso: string): string {
  const d = dayNum(iso);
  if (d === null) return iso;
  // 1970-01-01 は木曜。(d + 3) % 7 で 0=月曜 になる。
  const dow = (((d + 3) % 7) + 7) % 7;
  return fromDayNum(d - dow);
}

/** 曜日キー（mon..sun） */
export function weekdayKey(iso: string): string {
  const d = dayNum(iso)!;
  const dow = (((d + 3) % 7) + 7) % 7;
  return PY_WEEKDAY_KEY[dow];
}

export function daysBetween(later: string | null, earlier: string | null): number | null {
  const a = dayNum(later), b = dayNum(earlier);
  if (a === null || b === null) return null;
  return a - b;
}

/** 先の日付の結果を先行入力したときにマイナスにならないよう 0 で止める。 */
export function clamp0(v: number | null): number | null {
  return v === null ? null : Math.max(0, v);
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- 型

export interface NodeRow {
  id: number; name: string; tier: string; weekday: string; slot: string;
  time_code: number | null; fortress: number; capacity: number | null;
  bid_slots: number | null; effect: string; sort_order: number;
  active: number; effective_from: string;
}
export interface GuildRow { id: number; name: string; note: string; active: number; }
export interface BattleRow {
  id: number; battle_date: string; node_id: number; unified: number;
  banquet: number; winner_guild_id: number | null;
}
export interface InitialRow {
  node_id: number; guild_id: number | null;
  acquired_date: string | null; last_released_date: string | null;
}

export interface Occupation {
  nodeId: number;
  guildId: number | null;
  guildName: string;
  acquired: string;
  released: string | null;
  vacancyDays: number | null;   // 税
  holdingDays: number | null;
  battleId: number | null;
  isInitial: boolean;
}

export interface NodeState {
  nodeId: number;
  holderGuildId: number | null;
  holderName: string;
  heldSince: string | null;
  holdingDays: number | null;
  vacantSince: string | null;
  vacancyDaysNow: number | null;   // いま勝ったら得られる空席日数
  occupations: Occupation[];
}

// ---------------------------------------------------------------- 台帳

export class Ledger {
  today: string;
  guildNames = new Map<number, string>();
  nodeById = new Map<number, NodeRow>();
  states = new Map<number, NodeState>();
  battleResult = new Map<number, Occupation>();

  constructor(
    nodes: NodeRow[],
    guilds: GuildRow[],
    battles: BattleRow[],
    initials: InitialRow[],
    today?: string,
  ) {
    this.today = today ?? todayISO();
    for (const g of guilds) this.guildNames.set(g.id, g.name);
    for (const n of nodes) if (n.active) this.nodeById.set(n.id, n);

    const initialByNode = new Map<number, InitialRow>();
    for (const i of initials) initialByNode.set(i.node_id, i);

    // 勝利のあった戦だけを日付順に
    const wins = battles
      .filter((b) => b.winner_guild_id !== null && b.winner_guild_id !== undefined)
      .sort((a, b) =>
        a.battle_date === b.battle_date
          ? a.node_id - b.node_id
          : a.battle_date < b.battle_date ? -1 : 1);

    const guildWinDates = new Map<number, string[]>();
    const nodeWins = new Map<number, BattleRow[]>();
    for (const w of wins) {
      const gid = w.winner_guild_id!;
      if (!guildWinDates.has(gid)) guildWinDates.set(gid, []);
      guildWinDates.get(gid)!.push(w.battle_date);
      if (!nodeWins.has(w.node_id)) nodeWins.set(w.node_id, []);
      nodeWins.get(w.node_id)!.push(w);
    }
    for (const list of guildWinDates.values()) list.sort();

    for (const nodeId of this.nodeById.keys()) {
      this.states.set(
        nodeId,
        this.buildNode(nodeId, initialByNode.get(nodeId), nodeWins.get(nodeId) ?? [], guildWinDates),
      );
    }
  }

  private buildNode(
    nodeId: number,
    init: InitialRow | undefined,
    nodeWinRows: BattleRow[],
    guildWinDates: Map<number, string[]>,
  ): NodeState {
    const seq: Occupation[] = [];
    let prevReleaseSeed: string | null = null;

    if (init) {
      prevReleaseSeed = init.last_released_date ?? null;
      if (init.guild_id) {
        seq.push({
          nodeId, guildId: init.guild_id,
          guildName: this.guildNames.get(init.guild_id) ?? "?",
          acquired: init.acquired_date ?? this.today,
          released: null, vacancyDays: null, holdingDays: null,
          battleId: null, isInitial: true,
        });
      }
    }

    for (const w of nodeWinRows) {
      seq.push({
        nodeId, guildId: w.winner_guild_id,
        guildName: this.guildNames.get(w.winner_guild_id!) ?? "?",
        acquired: w.battle_date,
        released: null, vacancyDays: null, holdingDays: null,
        battleId: w.id, isInitial: false,
      });
    }

    seq.sort((a, b) =>
      a.acquired === b.acquired
        ? (a.isInitial ? 0 : 1) - (b.isInitial ? 0 : 1)
        : a.acquired < b.acquired ? -1 : 1);

    for (let i = 0; i < seq.length; i++) {
      const occ = seq[i];
      // a) この拠点で次に決着がついた日
      const nextNodeDate = i + 1 < seq.length ? seq[i + 1].acquired : null;
      // b) このギルドが他所で次に勝った日（＝移動して手放した日）
      let nextGuildDate: string | null = null;
      const dates = guildWinDates.get(occ.guildId ?? -1) ?? [];
      for (const d of dates) { if (d > occ.acquired) { nextGuildDate = d; break; } }

      const cands = [nextNodeDate, nextGuildDate].filter((d): d is string => !!d);
      occ.released = cands.length ? cands.reduce((a, b) => (a < b ? a : b)) : null;
      occ.holdingDays = clamp0(daysBetween(occ.released ?? this.today, occ.acquired));

      const prevRelease = i > 0 ? seq[i - 1].released : prevReleaseSeed;
      occ.vacancyDays = daysBetween(occ.acquired, prevRelease);

      if (occ.battleId !== null) this.battleResult.set(occ.battleId, occ);
    }

    // 週が変わったのに、前回開催分（先週分）の勝ったギルドが記入されていない場合は空席にする。
    // その拠点の開催曜日ぶんだけ「前回の開催予定日」を求め、今の保有者がそれより前から
    // 更新されていなければ、前回の開催予定日をもって手放したものとして扱う。
    if (seq.length) {
      const lastOcc = seq[seq.length - 1];
      if (lastOcc.released === null) {
        const node = this.nodeById.get(nodeId);
        const offset = node ? WEEKDAY_OFFSET[node.weekday] : undefined;
        if (offset !== undefined) {
          const lastScheduled = addDays(weekStart(this.today), offset - 7);
          if (lastOcc.acquired < lastScheduled) {
            lastOcc.released = lastScheduled;
            lastOcc.holdingDays = clamp0(daysBetween(lastOcc.released, lastOcc.acquired));
          }
        }
      }
    }

    const state: NodeState = {
      nodeId, holderGuildId: null, holderName: "", heldSince: null,
      holdingDays: null, vacantSince: null, vacancyDaysNow: null, occupations: seq,
    };

    if (seq.length && seq[seq.length - 1].released === null) {
      const last = seq[seq.length - 1];
      state.holderGuildId = last.guildId;
      state.holderName = last.guildName;
      state.heldSince = last.acquired;
      state.holdingDays = last.holdingDays;
      state.vacancyDaysNow = last.vacancyDays;
    } else {
      const vacantSince = seq.length ? seq[seq.length - 1].released : prevReleaseSeed;
      state.vacantSince = vacantSince;
      state.vacancyDaysNow = clamp0(daysBetween(this.today, vacantSince));
    }
    return state;
  }

  state(nodeId: number): NodeState {
    return this.states.get(nodeId) ?? {
      nodeId, holderGuildId: null, holderName: "", heldSince: null,
      holdingDays: null, vacantSince: null, vacancyDaysNow: null, occupations: [],
    };
  }

  /** ギルドID -> いま保有している拠点ID */
  guildHeldNode(): Map<number, number> {
    const out = new Map<number, number>();
    for (const [nodeId, st] of this.states) {
      if (st.holderGuildId) out.set(st.holderGuildId, nodeId);
    }
    return out;
  }

  guildHeldRank(): Map<number, number> {
    const out = new Map<number, number>();
    for (const [gid, nodeId] of this.guildHeldNode()) {
      const n = this.nodeById.get(nodeId);
      if (n) out.set(gid, tierRank(n.tier));
    }
    return out;
  }

  /**
   * その拠点に入札できるギルド。
   * 城 > 3 > 2 > 1。保有等級と同じか、それより上にのみ入札できる。
   * 無所属は 1〜3 に入札できる（攻城戦は不可）。
   * 攻城戦は 2 か 3（または城）を保有しているギルドのみ。
   */
  eligibleGuildIds(nodeId: number, activeOnly: Set<number> | null = null): number[] {
    const node = this.nodeById.get(nodeId);
    if (!node) return [];
    const nr = tierRank(node.tier);
    const ranks = this.guildHeldRank();
    const out: number[] = [];
    for (const gid of this.guildNames.keys()) {
      if (activeOnly && !activeOnly.has(gid)) continue;
      const held = ranks.get(gid) ?? 0;
      let ok: boolean;
      if (nr === 4) ok = held === 2 || held === 3 || held === 4;
      else if (held === 0) ok = nr <= 3;
      else ok = nr >= held;
      if (ok) out.push(gid);
    }
    return out;
  }

  taxRanking(limit?: number) {
    const rows = [...this.states.entries()].map(([nodeId, st]) => {
      const n = this.nodeById.get(nodeId)!;
      return {
        nodeId, name: n.name, tier: n.tier,
        tierLabel: TIER_LABEL[n.tier] ?? n.tier,
        holder: st.holderName,
        vacancyDays: st.vacancyDaysNow,
        isVacant: st.holderGuildId === null,
      };
    });
    rows.sort((a, b) => {
      const an = a.vacancyDays === null, bn = b.vacancyDays === null;
      if (an !== bn) return an ? 1 : -1;
      return (b.vacancyDays ?? 0) - (a.vacancyDays ?? 0);
    });
    return limit ? rows.slice(0, limit) : rows;
  }
}

/** 空席日数を6段階の色に振り分ける（表示用） */
export function heatClass(v: number | null): string {
  if (v === null) return "heat0";
  if (v >= 21) return "heat5";
  if (v >= 14) return "heat4";
  if (v >= 10) return "heat3";
  if (v >= 6) return "heat2";
  if (v >= 1) return "heat1";
  return "heat0";
}
