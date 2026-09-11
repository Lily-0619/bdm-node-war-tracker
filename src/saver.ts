import { json } from "./router";
import { buildXlsx, S, Sheet } from "./xlsx";

export const SAVER_SERVERS = ["ASIA", "EUROPE", "AMERICA"] as const;
export type SaverServer = typeof SAVER_SERVERS[number];
const SAVER_CLASS_ALIASES: Record<string, string> = { Askeia: "Mystic", Zayed: "Hashashin", Sura: "Ninja" };
const SAVER_CLASS_ORDER = ["Warrior", "Ranger", "Witch", "Giant", "Valkyrie", "Sorceress", "Musa", "Tamer",
  "Ninja", "Dark Knight", "Striker", "Maehwa", "Lahn", "Mystic", "Wizard", "Shai", "Kunoichi", "Archer",
  "Hashashin", "Nova", "Guardian", "Corsair", "Sage", "Drakania", "Maegu", "Woosa", "Scholar", "Dosa",
  "Deadeye", "Seraph"];

export interface SaverSnapshotInput {
  server: SaverServer;
  captured_date: string;
  captured_at?: string;
  total_players: number;
  active_players: number;
  total_guilds: number;
  active_guilds: number;
  classes: { class_name: string; player_count: number; sort_order?: number }[];
}

export interface SaverSnapshotRow {
  id: number;
  server: SaverServer;
  captured_date: string;
  captured_at: string;
  total_players: number;
  active_players: number;
  total_guilds: number;
  active_guilds: number;
}

export interface SaverClassRow {
  snapshot_id: number;
  class_name: string;
  player_count: number;
  sort_order: number;
}

export function validSaverPayload(value: unknown): value is SaverSnapshotInput[] {
  if (!Array.isArray(value) || value.length !== SAVER_SERVERS.length) return false;
  const seen = new Set<string>();
  for (const row of value) {
    if (!row || typeof row !== "object") return false;
    const r = row as Record<string, unknown>;
    if (!SAVER_SERVERS.includes(r.server as SaverServer) || seen.has(String(r.server))) return false;
    seen.add(String(r.server));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(r.captured_date ?? ""))) return false;
    for (const key of ["total_players", "active_players", "total_guilds", "active_guilds"] as const) {
      if (!Number.isInteger(r[key]) || Number(r[key]) < 0) return false;
    }
    if (Number(r.active_players) > Number(r.total_players) || Number(r.active_guilds) > Number(r.total_guilds)) return false;
    if (!Array.isArray(r.classes) || !r.classes.length || r.classes.length > 200) return false;
    const names = new Set<string>();
    for (const item of r.classes as Record<string, unknown>[]) {
      const name = String(item.class_name ?? "").trim();
      if (!name || name.length > 80 || names.has(name)) return false;
      names.add(name);
      if (!Number.isInteger(item.player_count) || Number(item.player_count) < 0) return false;
    }
    const classTotal = (r.classes as Record<string, unknown>[])
      .reduce((sum, item) => sum + Number(item.player_count), 0);
    if (classTotal < 900 || classTotal > 1100) return false;
  }
  return true;
}

export async function saveSaverSnapshots(db: D1Database, rows: SaverSnapshotInput[]): Promise<void> {
  for (const row of rows) {
    const capturedAt = row.captured_at && !Number.isNaN(Date.parse(row.captured_at))
      ? new Date(row.captured_at).toISOString() : new Date().toISOString();
    await db.prepare(
      "INSERT INTO saver_stats_snapshots (server,captured_date,captured_at,total_players,active_players,total_guilds,active_guilds)" +
      " VALUES (?,?,?,?,?,?,?) ON CONFLICT(server,captured_date) DO UPDATE SET" +
      " captured_at=excluded.captured_at,total_players=excluded.total_players," +
      " active_players=excluded.active_players,total_guilds=excluded.total_guilds,active_guilds=excluded.active_guilds"
    ).bind(row.server, row.captured_date, capturedAt, row.total_players, row.active_players,
      row.total_guilds, row.active_guilds).run();
    const snap = await db.prepare(
      "SELECT id FROM saver_stats_snapshots WHERE server=? AND captured_date=?"
    ).bind(row.server, row.captured_date).first<{ id: number }>();
    if (!snap) throw new Error(`snapshot id not found: ${row.server}/${row.captured_date}`);
    const statements: D1PreparedStatement[] = [
      db.prepare("DELETE FROM saver_stats_classes WHERE snapshot_id=?").bind(snap.id),
      ...row.classes.map((item, index) => db.prepare(
        "INSERT INTO saver_stats_classes (snapshot_id,class_name,player_count,sort_order) VALUES (?,?,?,?)"
      ).bind(snap.id, item.class_name.trim(), item.player_count, item.sort_order ?? index)),
    ];
    await db.batch(statements);
  }
}

export async function loadSaverStats(db: D1Database, from?: string, to?: string) {
  const where = from && to ? " WHERE captured_date BETWEEN ? AND ?" : "";
  const stmt = db.prepare("SELECT * FROM saver_stats_snapshots" + where + " ORDER BY captured_date,server");
  const snaps = from && to
    ? await stmt.bind(from, to).all<SaverSnapshotRow>() : await stmt.all<SaverSnapshotRow>();
  const snapshots = snaps.results ?? [];
  if (!snapshots.length) return { snapshots, classes: [] as SaverClassRow[] };
  const ids = snapshots.map((s) => s.id);
  const placeholders = ids.map(() => "?").join(",");
  const classes = await db.prepare(
    `SELECT snapshot_id,class_name,player_count,sort_order FROM saver_stats_classes WHERE snapshot_id IN (${placeholders}) ORDER BY sort_order,class_name`
  ).bind(...ids).all<SaverClassRow>();
  return { snapshots, classes: classes.results ?? [] };
}

export function saverWorkbook(data: Awaited<ReturnType<typeof loadSaverStats>>): Uint8Array {
  const summaryRows: Sheet["rows"] = [
    ["取得日", "サーバー", "総プレイヤー", "アクティブプレイヤー（1か月）", "総ギルド", "アクティブギルド（1か月）", "取得日時"]
      .map((v) => ({ v, s: S.HEADER })),
    ...data.snapshots.map((r) => [r.captured_date, r.server,
      r.total_players < 0 ? "—" : r.total_players, r.active_players,
      r.total_guilds < 0 ? "—" : r.total_guilds, r.active_guilds, r.captured_at]),
  ];
  const sourceById = new Map<number, SaverClassRow[]>();
  data.classes.forEach((row) => {
    if (!sourceById.has(row.snapshot_id)) sourceById.set(row.snapshot_id, []);
    sourceById.get(row.snapshot_id)!.push(row);
  });
  const classRows: Sheet["rows"] = [
    ["取得日", "サーバー", "職", "Top1000人数", "表示順"].map((v) => ({ v, s: S.HEADER })),
    ...data.snapshots.flatMap((snapshot) => {
      const merged = new Map<string, number>();
      for (const row of sourceById.get(snapshot.id) ?? []) {
        const name = SAVER_CLASS_ALIASES[row.class_name] ?? row.class_name;
        merged.set(name, (merged.get(name) ?? 0) + row.player_count);
      }
      return SAVER_CLASS_ORDER.filter((name) => merged.has(name)).map((name, index) =>
        [snapshot.captured_date, snapshot.server, name, merged.get(name)!, index + 1]);
    }),
  ];
  return buildXlsx([
    { name: "SaverStats", rows: summaryRows, cols: [14, 12, 16, 28, 14, 26, 25], freezeRows: 1 },
    { name: "Top1000職", rows: classRows, cols: [14, 12, 24, 16, 10], freezeRows: 1 },
  ]);
}

export function renderSaverStatsPage(): string {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SaverStats 推移</title><link rel="stylesheet" href="/app.css"></head>
<body class="stats-page"><div class="ribbon"><a class="title stats-home" href="/">拠点戦・税収管理ボード</a><span class="chip">SaverStats</span></div>
<main class="stats-wrap"><header class="stats-header"><div><h1>SaverStats 推移</h1><p>Asia・Europe・America の日次取得データ</p></div><a class="btn excel" href="/saver-stats/export.xlsx">Excelでダウンロード</a></header>
<section class="stats-controls"><label>開始日 <input id="stats-from" type="date"></label><label>終了日 <input id="stats-to" type="date"></label><label>サーバー <select id="stats-server"><option value="ASIA">Asia</option><option value="EUROPE">Europe</option><option value="AMERICA">America</option></select></label><button class="btn primary" id="stats-apply">表示</button></section>
<div id="stats-error" class="stats-error" hidden></div><section id="stats-latest" class="stats-kpis"></section>
<section class="stats-card"><div class="stats-card-head"><h2>職 Top1000 推移</h2><p class="stats-note">各職とも新しい日付が上です。棒の右端を結ぶ線で人数の変化を確認できます。</p></div><div id="class-chart" class="class-chart-grid"></div></section>
<section class="stats-card"><div class="stats-card-head"><h2>サーバー状況の推移</h2></div><div id="metric-chart" class="metric-chart-grid"></div></section>
</main>
<script src="/saver-stats.js"></script></body></html>`;
}

export function saverJsonError(message: string, status = 400): Response {
  return json({ ok: false, error: message }, status);
}
