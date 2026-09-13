export type KarteRunStatus = "queued" | "collecting" | "analyzing" | "completed" | "partial" | "failed";

export interface KarteGuildInput {
  guild_name: string;
  retrieved_at: string;
  summary?: Record<string, unknown>;
  members: Array<Record<string, unknown>>;
  raw?: Record<string, unknown>;
}

const textValue = (value: unknown) => typeof value === "string" ? value.trim() : "";
const numberValue = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;

export function validKarteGuildInput(value: unknown): value is KarteGuildInput {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (!textValue(row.guild_name) || !/^\d{4}-\d{2}-\d{2}/.test(textValue(row.retrieved_at))) return false;
  if (!Array.isArray(row.members)) return false;
  return row.members.every((member) => !!member && typeof member === "object" &&
    !!textValue((member as Record<string, unknown>).family_name));
}

export async function karteDashboard(db: D1Database) {
  const [guilds, run, reviews, tracked, analyses] = await Promise.all([
    db.prepare("SELECT id,name,enabled,sort_order FROM karte_guilds ORDER BY sort_order,name").all(),
    db.prepare("SELECT * FROM karte_runs ORDER BY id DESC LIMIT 1").first(),
    db.prepare("SELECT * FROM karte_review_items WHERE status IN ('pending','hold') ORDER BY detected_at DESC,id DESC").all(),
    db.prepare("SELECT id,current_family_name,tracking_enabled FROM karte_people WHERE tracking_enabled=1 ORDER BY current_family_name").all(),
    db.prepare(`SELECT g.name,s.retrieved_date,s.member_count,s.avg_cp,s.total_cp,s.total_fcp,
      s.avg_cp-(SELECT p.avg_cp FROM karte_guild_snapshots p WHERE p.guild_id=s.guild_id AND p.retrieved_at<s.retrieved_at ORDER BY p.retrieved_at DESC LIMIT 1) avg_cp_change,
      s.total_cp-(SELECT p.total_cp FROM karte_guild_snapshots p WHERE p.guild_id=s.guild_id AND p.retrieved_at<s.retrieved_at ORDER BY p.retrieved_at DESC LIMIT 1) total_cp_change
      FROM karte_guild_snapshots s JOIN karte_guilds g ON g.id=s.guild_id
      WHERE s.id=(SELECT p.id FROM karte_guild_snapshots p WHERE p.guild_id=s.guild_id ORDER BY p.retrieved_at DESC LIMIT 1)
      ORDER BY g.sort_order,g.name`).all(),
  ]);
  return { guilds: guilds.results ?? [], run, reviews: reviews.results ?? [], tracked: tracked.results ?? [], analyses: analyses.results ?? [] };
}

export async function createKarteRun(db: D1Database): Promise<number> {
  const count = await db.prepare("SELECT COUNT(*) count FROM karte_guilds WHERE enabled=1").first<{ count: number }>();
  const result = await db.prepare("INSERT INTO karte_runs(total_guilds) VALUES(?)").bind(count?.count ?? 0).run();
  return Number(result.meta.last_row_id);
}

export async function saveKarteGuild(db: D1Database, runId: number, input: KarteGuildInput, allowCreate = false) {
  let guild = await db.prepare("SELECT id FROM karte_guilds WHERE name=?" )
    .bind(input.guild_name).first<{ id: number }>();
  if (!guild && allowCreate) {
    const made = await db.prepare("INSERT INTO karte_guilds(name,enabled,sort_order) VALUES(?,0,9999)")
      .bind(input.guild_name).run();
    guild = { id: Number(made.meta.last_row_id) };
  }
  if (!guild) throw new Error(`未登録のギルドです: ${input.guild_name}`);
  const summary = input.summary ?? {};
  const date = input.retrieved_at.slice(0, 10);
  await db.prepare(`INSERT INTO karte_guild_snapshots(
    run_id,guild_id,retrieved_at,retrieved_date,member_count,avg_cp,total_cp,total_fcp,
    active_member_count,low_member_cp,high_member_cp,declared_on_other_guild,
    declared_by_other_guild,total_war,all_time_win_rate,most_war_with_guild,
    total_node_wars,node_won,total_siege_wars,siege_won,currently_holding,raw_json)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(guild_id,retrieved_at) DO UPDATE SET
    run_id=excluded.run_id,retrieved_date=excluded.retrieved_date,member_count=excluded.member_count,
    avg_cp=excluded.avg_cp,total_cp=excluded.total_cp,total_fcp=excluded.total_fcp,
    active_member_count=excluded.active_member_count,low_member_cp=excluded.low_member_cp,
    high_member_cp=excluded.high_member_cp,declared_on_other_guild=excluded.declared_on_other_guild,
    declared_by_other_guild=excluded.declared_by_other_guild,total_war=excluded.total_war,
    all_time_win_rate=excluded.all_time_win_rate,most_war_with_guild=excluded.most_war_with_guild,
    total_node_wars=excluded.total_node_wars,node_won=excluded.node_won,
    total_siege_wars=excluded.total_siege_wars,siege_won=excluded.siege_won,
    currently_holding=excluded.currently_holding,raw_json=excluded.raw_json`)
    .bind(runId, guild.id, input.retrieved_at, date,
      numberValue(summary.member_count), numberValue(summary.avg_cp ?? summary.avg_cpm),
      numberValue(summary.total_cp ?? summary.total_cpm),
      numberValue(summary.total_fcp ?? summary.total_family_cp), numberValue(summary.active_member_count), numberValue(summary.low_member_cp),
      numberValue(summary.high_member_cp), numberValue(summary.declared_on_other_guild),
      numberValue(summary.declared_by_other_guild), numberValue(summary.total_war),
      numberValue(summary.all_time_win_rate), textValue(summary.most_war_with_guild) || null,
      numberValue(summary.total_node_wars), numberValue(summary.node_won), numberValue(summary.total_siege_wars),
      numberValue(summary.siege_won), textValue(summary.currently_holding) || null,
      JSON.stringify(input.raw ?? input)).run();
  const snapshot = await db.prepare("SELECT id FROM karte_guild_snapshots WHERE guild_id=? AND retrieved_at=?")
    .bind(guild.id, input.retrieved_at).first<{ id: number }>();
  if (!snapshot) throw new Error("ギルド履歴を保存できませんでした");
  for (const member of input.members) {
    const familyName = textValue(member.family_name);
    let person = await db.prepare(`SELECT p.id FROM karte_people p JOIN karte_person_names n ON n.person_id=p.id
      WHERE n.family_name=? ORDER BY p.id LIMIT 1`).bind(familyName).first<{ id: number }>();
    if (!person) {
      const made = await db.prepare("INSERT INTO karte_people(current_family_name) VALUES(?)").bind(familyName).run();
      person = { id: Number(made.meta.last_row_id) };
      await db.prepare("INSERT INTO karte_person_names(person_id,family_name,valid_from) VALUES(?,?,?)")
        .bind(person.id, familyName, date).run();
    }
    await db.prepare(`INSERT INTO karte_member_snapshots(
      guild_snapshot_id,person_id,family_name,rank_no,level,cp,fcp,class_name_raw,
      class_name_normalized,class_name_version,raw_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(guild_snapshot_id,family_name) DO UPDATE SET
      person_id=excluded.person_id,rank_no=excluded.rank_no,level=excluded.level,cp=excluded.cp,
      fcp=excluded.fcp,class_name_raw=excluded.class_name_raw,
      class_name_normalized=excluded.class_name_normalized,class_name_version=excluded.class_name_version,
      raw_json=excluded.raw_json`)
      .bind(snapshot.id, person.id, familyName, numberValue(member.rank_no), numberValue(member.level),
        numberValue(member.cp ?? member.cpm), numberValue(member.fcp), textValue(member.class_name_raw) || null,
        textValue(member.class_name_normalized ?? member.class_name) || null,
        textValue(member.class_name_version) || null, JSON.stringify(member)).run();
  }
  if (!allowCreate) {
    await db.prepare(`UPDATE karte_runs SET status='collecting',phase='収集中',completed_guilds=completed_guilds+1,
      current_guild=? WHERE id=?`).bind(input.guild_name, runId).run();
  }
}

export function renderKartePage(): string {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ギルドカルテ解析</title><link rel="stylesheet" href="/app.css"></head>
  <body><main class="stats-wrap"><header class="stats-header"><div><h1>ギルドカルテ解析</h1><p>登録ギルドの一括収集・解析と人物追跡</p></div><a class="btn" href="/">税収画面へ戻る</a></header>
  <div id="karte-error" class="stats-error" hidden></div>
  <section class="stats-card"><div class="stats-card-head"><h2>収集・解析</h2><button id="karte-run" class="btn primary">収集・解析開始</button></div><div id="karte-status">読み込み中…</div></section>
  <section class="stats-card"><h2>登録ギルド</h2><div id="karte-guilds"></div></section>
  <section class="stats-card"><h2>最新解析</h2><div id="karte-analysis"></div></section>
  <section class="stats-card"><h2>追跡対象者</h2><p class="stats-note">選択した人物だけName Searchで追跡します。</p><div><input id="karte-person-query" placeholder="家門名を検索"><button id="karte-person-search" class="btn">検索</button></div><div id="karte-people"></div><h3>追跡中</h3><div id="karte-tracked"></div></section>
  <section class="stats-card"><h2>確認待ち</h2><div id="karte-reviews"></div></section>
  </main><script src="/guild-karte.js"></script></body></html>`;
}
