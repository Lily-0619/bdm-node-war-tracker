/**
 * 拠点戦・税収管理ボード — Cloudflare Workers + D1
 *
 * 外部npmパッケージに一切依存していない（ルーターもZIPも自前）。
 * 依存のインストールが走らない環境でもビルドが通る。
 */
import { buildWeek } from "./board";
import {
  BattleRow, GuildRow, InitialRow, Ledger, NodeRow, addDays, weekStart,
} from "./calc";
import { fullWorkbook, initialHoldingsTemplateCsv } from "./export";
import { Ctx, Router, html, json, redirect, setCookieHeader, text } from "./router";
import { renderLogin, renderPage } from "./views";

export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  EDIT_PASSWORD?: string;
  APP_TIMEZONE_OFFSET?: string;   // 例 "9"（日本時間）
}

const COOKIE = "kyoten_edit";
const DEFAULT_START = "2026-08-17";

/** ワーカーはUTCで動くので、日本時間の「今日」に補正する */
function localToday(env: Env): string {
  const offset = Number(env.APP_TIMEZONE_OFFSET ?? "9");
  return new Date(Date.now() + offset * 3600_000).toISOString().slice(0, 10);
}

async function tokenFor(pw: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("kyoten:" + pw));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function canEdit(c: Ctx<Env>): Promise<boolean> {
  const pw = c.env.EDIT_PASSWORD;
  if (!pw) return true;                       // パスワード未設定なら誰でも編集可
  return c.cookie(COOKIE) === (await tokenFor(pw));
}

async function loadAll(env: Env) {
  const [nodes, guilds, battles, initials] = await Promise.all([
    env.DB.prepare("SELECT * FROM nodes").all<NodeRow>(),
    env.DB.prepare("SELECT id, name, note, active FROM guilds ORDER BY active DESC, name").all<GuildRow>(),
    env.DB.prepare(
      "SELECT id, battle_date, node_id, unified, banquet, winner_guild_id FROM battles"
    ).all<BattleRow>(),
    env.DB.prepare("SELECT * FROM initial_holdings").all<InitialRow>(),
  ]);
  return {
    nodes: nodes.results ?? [],
    guilds: guilds.results ?? [],
    battles: battles.results ?? [],
    initials: initials.results ?? [],
  };
}

type PartRow = { battle_id: number; guild_id: number; position: number; name: string };

async function loadParticipants(env: Env, from?: string, to?: string): Promise<PartRow[]> {
  const base =
    "SELECT bp.battle_id, bp.guild_id, bp.position, g.name" +
    " FROM battle_participants bp" +
    " JOIN guilds g ON g.id = bp.guild_id" +
    " JOIN battles b ON b.id = bp.battle_id";
  const tail = " ORDER BY bp.position, g.name";
  const stmt = from && to
    ? env.DB.prepare(base + " WHERE b.battle_date BETWEEN ? AND ?" + tail).bind(from, to)
    : env.DB.prepare(base + tail);
  const res = await stmt.all<PartRow>();
  return res.results ?? [];
}

async function getSetting(env: Env, key: string, fallback: string) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?")
    .bind(key).first<{ value: string }>();
  return row?.value ?? fallback;
}

const router = new Router<Env>();

// ---------------------------------------------------------------- 画面
router.get("/", async (c) => {
  const env = c.env;
  const today = localToday(env);
  const startDate = await getSetting(env, "start_date", DEFAULT_START);

  const weekArg = c.query("week");
  const monday = weekStart(
    weekArg && /^\d{4}-\d{2}-\d{2}$/.test(weekArg)
      ? weekArg
      : (today >= startDate ? today : startDate),
  );

  const { nodes, guilds, battles, initials } = await loadAll(env);
  const parts = await loadParticipants(env, monday, addDays(monday, 6));
  // 右側の税収ランキング・保有サマリは「いまの最新状態」で見せる
  const ledger = new Ledger(nodes, guilds, battles, initials, today);

  // 週次ボードの「保有ギルド」は、その週が始まった時点のスナップショット。
  // 週の途中で結果が出ても書き換わらず、勝ったギルドは翌週の保有ギルドになる。
  const boardLedger = new Ledger(
    nodes, guilds,
    battles.filter((b) => b.battle_date < monday),
    initials, monday,
  );

  const activeIds = new Set(guilds.filter((g) => g.active).map((g) => g.id));
  const weekBattles = battles.filter(
    (b) => b.battle_date >= monday && b.battle_date <= addDays(monday, 6));
  const week = buildWeek(monday, boardLedger, nodes, weekBattles, parts, activeIds, today);

  return html(renderPage({
    week, ledger, nodes, guilds,
    activeGuilds: guilds.filter((g) => g.active).map((g) => ({ id: g.id, name: g.name })),
    startDate, today,
    canEdit: await canEdit(c),
    authEnabled: !!env.EDIT_PASSWORD,
  }));
});

router.get("/login", () => html(renderLogin()));

router.post("/login", async (c) => {
  const form = await c.formData();
  const pw = String(form.get("password") ?? "");
  if (!c.env.EDIT_PASSWORD || pw !== c.env.EDIT_PASSWORD) {
    return html(renderLogin("パスワードが違います"), 401);
  }
  const token = await tokenFor(c.env.EDIT_PASSWORD);
  return redirect("/", {
    "Set-Cookie": setCookieHeader(COOKIE, token, { maxAge: 60 * 60 * 24 * 90 }),
  });
});

router.get("/logout", () =>
  redirect("/", { "Set-Cookie": setCookieHeader(COOKIE, "", { maxAge: 0 }) }));

// ---------------------------------------------------------------- Excel（全データ1ファイル）
router.get("/export.xlsx", async (c) => {
  const env = c.env;
  const today = localToday(env);
  const { nodes, guilds, battles, initials } = await loadAll(env);
  const parts = await loadParticipants(env);
  const ledger = new Ledger(nodes, guilds, battles, initials, today);
  const startDate = await getSetting(env, "start_date", DEFAULT_START);

  const bytes = fullWorkbook({ ledger, nodes, guilds, battles, participants: parts, startDate, today });
  const filename = `拠点戦_税収_${today}.xlsx`;
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        `attachment; filename="kyoten_${today}.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
});

// ---------------------------------------------------------------- 保存API
async function requireEdit(c: Ctx<Env>): Promise<Response | null> {
  if (await canEdit(c)) return null;
  return json({ ok: false, error: "編集するにはログインしてください" }, 401);
}

interface SaveRow {
  battle_date: string; node_id: number; unified?: boolean; banquet?: boolean;
  participants?: number[]; winner_guild_id?: number | string | null;
}

router.post("/api/week/save", async (c) => {
  const denied = await requireEdit(c);
  if (denied) return denied;

  const env = c.env;
  const data = await c.json<{ monday: string; rows: SaveRow[] }>();
  const startDate = await getSetting(env, "start_date", DEFAULT_START);
  const now = new Date().toISOString();
  const from = data.monday, to = addDays(data.monday, 6);

  const existing = await env.DB.prepare(
    "SELECT id, battle_date, node_id FROM battles WHERE battle_date BETWEEN ? AND ?"
  ).bind(from, to).all<{ id: number; battle_date: string; node_id: number }>();
  const existingKey = new Set((existing.results ?? []).map((r) => `${r.battle_date}_${r.node_id}`));

  const normalized = (data.rows ?? []).map((r) => {
    const date = String(r.battle_date).slice(0, 10);
    const winner = r.winner_guild_id ? Number(r.winner_guild_id) : null;
    const parts = (r.participants ?? []).map(Number).filter(Boolean);
    if (winner && parts.length && !parts.includes(winner)) parts.push(winner);
    return { date, nodeId: Number(r.node_id), winner, parts, unified: !!r.unified, banquet: !!r.banquet };
  }).filter((r) => r.date >= startDate);

  const statements: D1PreparedStatement[] = [];
  let saved = 0;
  for (const r of normalized) {
    const hasContent = !!(r.winner || r.parts.length || r.unified || r.banquet);
    if (!hasContent && !existingKey.has(`${r.date}_${r.nodeId}`)) continue;
    statements.push(
      env.DB.prepare(
        "INSERT INTO battles (battle_date, node_id, unified, banquet, winner_guild_id, updated_at)" +
        " VALUES (?, ?, ?, ?, ?, ?)" +
        " ON CONFLICT(battle_date, node_id) DO UPDATE SET" +
        "  unified = excluded.unified, banquet = excluded.banquet," +
        "  winner_guild_id = excluded.winner_guild_id, updated_at = excluded.updated_at"
      ).bind(r.date, r.nodeId, r.unified ? 1 : 0, r.banquet ? 1 : 0, r.winner, now)
    );
    saved++;
  }
  if (statements.length) await env.DB.batch(statements);

  // 参加ギルドは battle_id が確定してから入れ替える
  const after = await env.DB.prepare(
    "SELECT id, battle_date, node_id FROM battles WHERE battle_date BETWEEN ? AND ?"
  ).bind(from, to).all<{ id: number; battle_date: string; node_id: number }>();
  const idByKey = new Map((after.results ?? []).map((r) => [`${r.battle_date}_${r.node_id}`, r.id]));

  const partStatements: D1PreparedStatement[] = [];
  for (const r of normalized) {
    const id = idByKey.get(`${r.date}_${r.nodeId}`);
    if (!id) continue;
    partStatements.push(env.DB.prepare("DELETE FROM battle_participants WHERE battle_id = ?").bind(id));
    r.parts.forEach((gid, i) => {
      partStatements.push(env.DB.prepare(
        "INSERT OR IGNORE INTO battle_participants (battle_id, guild_id, position) VALUES (?, ?, ?)"
      ).bind(id, gid, i + 1));
    });
  }
  if (partStatements.length) await env.DB.batch(partStatements);

  return json({ ok: true, saved });
});

router.post("/api/guild", async (c) => {
  const denied = await requireEdit(c);
  if (denied) return denied;
  const d = await c.json<{ id?: number | null; name?: string; note?: string; active?: boolean }>();
  const name = (d.name ?? "").trim();
  if (!name) return json({ ok: false, error: "ギルド名を入力してください" }, 400);
  const active = d.active === false ? 0 : 1;
  try {
    if (d.id) {
      await c.env.DB.prepare("UPDATE guilds SET name = ?, note = ?, active = ? WHERE id = ?")
        .bind(name, d.note ?? "", active, Number(d.id)).run();
    } else {
      await c.env.DB.prepare("INSERT INTO guilds (name, note, active) VALUES (?, ?, ?)")
        .bind(name, d.note ?? "", active).run();
    }
  } catch (e) {
    return json({ ok: false, error: `保存できません（同じ名前が既にあるかも）: ${e}` }, 400);
  }
  return json({ ok: true });
});

// guild_master.csv（legacy_row,guild_name,note,is_sentinel 等の形式）を取り込んで
// 名前でupsertする。既存ギルドは note を更新、新しい名前は追加。削除・無効化はしない
// （試合記録が既に紐づいている可能性があるため、無効化はギルド管理画面から手動で）。
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const pushCell = () => { row.push(cell); cell = ""; };
  const pushRow = () => { pushCell(); rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") pushCell();
    else if (ch === "\n") pushRow();
    else if (ch === "\r") { /* skip */ }
    else cell += ch;
  }
  if (cell.length || row.length) pushRow();
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

router.post("/api/guild/import", async (c) => {
  const denied = await requireEdit(c);
  if (denied) return denied;
  const d = await c.json<{ csv?: string }>();
  const csvText = (d.csv ?? "").replace(/^﻿/, "");
  if (!csvText.trim()) return json({ ok: false, error: "CSVの中身が空です" }, 400);

  const table = parseCsv(csvText);
  if (!table.length) return json({ ok: false, error: "CSVを読み取れませんでした" }, 400);
  const header = table[0].map((h) => h.trim().toLowerCase());
  const nameIdx = header.findIndex((h) => h === "guild_name" || h === "name" || h === "ギルド名");
  const noteIdx = header.findIndex((h) => h === "note" || h === "メモ");
  const sentinelIdx = header.findIndex((h) => h === "is_sentinel" || h === "sentinel");
  if (nameIdx < 0) {
    return json({ ok: false, error: "guild_name（またはname）列が見つかりません" }, 400);
  }

  const existing = await c.env.DB.prepare("SELECT id, name FROM guilds").all<{ id: number; name: string }>();
  const existingByName = new Map((existing.results ?? []).map((g) => [g.name, g.id]));

  let added = 0, updated = 0, skipped = 0;
  const statements: D1PreparedStatement[] = [];
  for (const r of table.slice(1)) {
    const name = (r[nameIdx] ?? "").trim();
    const note = noteIdx >= 0 ? (r[noteIdx] ?? "").trim() : "";
    const sentinel = sentinelIdx >= 0 && /^true$/i.test((r[sentinelIdx] ?? "").trim());
    if (!name || sentinel) { skipped++; continue; }
    const existingId = existingByName.get(name);
    if (existingId) {
      statements.push(c.env.DB.prepare("UPDATE guilds SET note = ? WHERE id = ?").bind(note, existingId));
      updated++;
    } else {
      statements.push(c.env.DB.prepare(
        "INSERT INTO guilds (name, note, active) VALUES (?, ?, 1)"
      ).bind(name, note));
      added++;
    }
  }
  if (statements.length) await c.env.DB.batch(statements);
  return json({ ok: true, added, updated, skipped });
});

router.post("/api/node", async (c) => {
  const denied = await requireEdit(c);
  if (denied) return denied;
  const d = await c.json<any>();
  const name = (d.name ?? "").trim();
  if (!name) return json({ ok: false, error: "拠点名を入力してください" }, 400);
  const vals = [
    name, String(d.tier ?? "1"), d.weekday ?? "mon", d.slot ?? "",
    d.time_code ? Number(d.time_code) : null,
    d.fortress ? 1 : 0,
    d.capacity ? Number(d.capacity) : null,
    d.bid_slots ? Number(d.bid_slots) : null,
    d.effect ?? "",
    d.active === false ? 0 : 1,
    d.effective_from || localToday(c.env),
  ];
  try {
    if (d.id) {
      await c.env.DB.prepare(
        "UPDATE nodes SET name=?, tier=?, weekday=?, slot=?, time_code=?, fortress=?," +
        " capacity=?, bid_slots=?, effect=?, active=?, effective_from=? WHERE id=?"
      ).bind(...vals, Number(d.id)).run();
    } else {
      await c.env.DB.prepare(
        "INSERT INTO nodes (name, tier, weekday, slot, time_code, fortress, capacity," +
        " bid_slots, effect, active, effective_from, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,999)"
      ).bind(...vals).run();
    }
  } catch (e) {
    return json({ ok: false, error: `保存できません: ${e}` }, 400);
  }
  return json({ ok: true });
});

router.post("/api/initial-holding", async (c) => {
  const denied = await requireEdit(c);
  if (denied) return denied;
  const d = await c.json<any>();
  await c.env.DB.prepare(
    "INSERT INTO initial_holdings (node_id, guild_id, acquired_date, last_released_date)" +
    " VALUES (?, ?, ?, ?)" +
    " ON CONFLICT(node_id) DO UPDATE SET guild_id = excluded.guild_id," +
    "  acquired_date = excluded.acquired_date, last_released_date = excluded.last_released_date"
  ).bind(
    Number(d.node_id),
    d.guild_id ? Number(d.guild_id) : null,
    d.acquired_date || null,
    d.last_released_date || null,
  ).run();
  return json({ ok: true });
});

// 運用開始時、最初の1回だけ埋める「今どこを誰が持っているか」のテンプレートCSV。
router.get("/export/initial-template.csv", async (c) => {
  const { nodes } = await loadAll(c.env);
  const csv = initialHoldingsTemplateCsv(nodes);
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="initial_holdings_template.csv"; filename*=UTF-8''${encodeURIComponent("初期保有_入力用.csv")}`,
    },
  });
});

// 「2026/8/10」「2026-8-10」やExcelのシリアル値など、YYYY-MM-DD以外で
// 入力された日付をYYYY-MM-DDに正規化する。計算コア(calc.ts)はYYYY-MM-DD形式しか
// 認識しないため、ここで揃えないと日付がずれて税・保有日数が空欄のまま計算されない。
function normalizeDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (!m) m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})/.exec(s);
  if (m) {
    const y = m[1], mo = m[2].padStart(2, "0"), da = m[3].padStart(2, "0");
    const d = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(da)));
    if (d.getUTCFullYear() !== Number(y) || d.getUTCMonth() !== Number(mo) - 1) return null;
    return `${y}-${mo}-${da}`;
  }
  // Excelのシリアル値（1900年1月1日を1とする数値）
  if (/^\d{4,6}$/.test(s)) {
    const serial = Number(s);
    const ms = Date.UTC(1899, 11, 30) + serial * 86400000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) {
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    }
  }
  return null;
}

// 埋めたテンプレートCSVを貼り付けて一括登録。拠点名・ギルド名は登録済みの名前と完全一致で照合する。
// これは運用開始時の最初の1回だけ使う。それ以降は週次ボードの入力がそのまま反映される。
router.post("/api/initial-holding/import", async (c) => {
  const denied = await requireEdit(c);
  if (denied) return denied;
  const d = await c.json<{ csv?: string }>();
  const csvText = (d.csv ?? "").replace(/^﻿/, "");
  if (!csvText.trim()) return json({ ok: false, error: "CSVの中身が空です" }, 400);

  const table = parseCsv(csvText);
  if (!table.length) return json({ ok: false, error: "CSVを読み取れませんでした" }, 400);
  const header = table[0].map((h) => h.trim());
  const nodeIdx = header.findIndex((h) => h.startsWith("拠点名"));
  const guildIdx = header.findIndex((h) => h.startsWith("現保有ギルド"));
  const acqIdx = header.findIndex((h) => h.startsWith("獲得日"));
  const relIdx = header.findIndex((h) => h.startsWith("前回放棄日"));
  if (nodeIdx < 0) return json({ ok: false, error: "拠点名の列が見つかりません" }, 400);

  const { nodes, guilds } = await loadAll(c.env);
  const nodeByName = new Map(nodes.map((n) => [n.name, n.id]));
  const guildByName = new Map(guilds.map((g) => [g.name, g.id]));

  let applied = 0, skipped = 0;
  const errors: string[] = [];
  const statements: D1PreparedStatement[] = [];
  for (const r of table.slice(1)) {
    const nodeName = (r[nodeIdx] ?? "").trim();
    if (!nodeName) { skipped++; continue; }
    const nodeId = nodeByName.get(nodeName);
    if (!nodeId) { errors.push(`拠点「${nodeName}」が見つかりません`); skipped++; continue; }
    const guildName = guildIdx >= 0 ? (r[guildIdx] ?? "").trim() : "";
    const acquiredRaw = acqIdx >= 0 ? (r[acqIdx] ?? "").trim() : "";
    const releasedRaw = relIdx >= 0 ? (r[relIdx] ?? "").trim() : "";
    if (!guildName && !releasedRaw) { skipped++; continue; }  // 何も入力されていない行はスキップ
    let guildId: number | null = null;
    if (guildName) {
      guildId = guildByName.get(guildName) ?? null;
      if (guildId === null) { errors.push(`「${nodeName}」のギルド「${guildName}」が見つかりません`); skipped++; continue; }
    }
    const acquired = acquiredRaw ? normalizeDate(acquiredRaw) : null;
    const released = releasedRaw ? normalizeDate(releasedRaw) : null;
    if (acquiredRaw && !acquired) errors.push(`「${nodeName}」の獲得日「${acquiredRaw}」を読み取れません（YYYY-MM-DD形式で入力してください）`);
    if (releasedRaw && !released) errors.push(`「${nodeName}」の前回放棄日「${releasedRaw}」を読み取れません（YYYY-MM-DD形式で入力してください）`);
    statements.push(c.env.DB.prepare(
      "INSERT INTO initial_holdings (node_id, guild_id, acquired_date, last_released_date)" +
      " VALUES (?, ?, ?, ?)" +
      " ON CONFLICT(node_id) DO UPDATE SET guild_id = excluded.guild_id," +
      "  acquired_date = excluded.acquired_date, last_released_date = excluded.last_released_date"
    ).bind(nodeId, guildId, acquired || null, released || null));
    applied++;
  }
  if (statements.length) await c.env.DB.batch(statements);
  return json({ ok: true, applied, skipped, errors: errors.slice(0, 20) });
});

router.get("/api/eligible/:nodeId", async (c) => {
  const nodeId = Number(c.params.nodeId);
  const today = localToday(c.env);
  const { nodes, guilds, battles, initials } = await loadAll(c.env);
  const ledger = new Ledger(nodes, guilds, battles, initials, today);
  const activeIds = new Set(guilds.filter((g) => g.active).map((g) => g.id));
  const ids = new Set(ledger.eligibleGuildIds(nodeId, activeIds));
  return json(guilds.filter((g) => ids.has(g.id)).map((g) => ({ id: g.id, name: g.name })));
});

router.get("/favicon.ico", () => new Response(null, { status: 204 }));
router.get("/healthz", () => text("ok"));

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const res = await router.handle(req, env);
      if (res) return res;
      // 静的ファイル（/app.css, /app.js）
      if (env.ASSETS) return env.ASSETS.fetch(req);
      return text("Not Found", 404);
    } catch (e) {
      const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e);
      return new Response(
        `<!DOCTYPE html><meta charset="utf-8"><body style="font-family:sans-serif;padding:24px">
         <h2>エラーが発生しました</h2>
         <p>D1のテーブルがまだ作られていない場合は、次を実行してください:</p>
         <pre style="background:#f4f4f4;padding:10px">npx wrangler d1 migrations apply kyoten --remote</pre>
         <pre style="background:#fff0f0;padding:10px;white-space:pre-wrap">${msg
          .replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre></body>`,
        { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }
  },
};
