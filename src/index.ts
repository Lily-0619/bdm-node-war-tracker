/** Active site after closing season 1. Historical tax data has no runtime routes. */
import { Router, html, json, text } from "./router";
import { renderEnhancementSimulator } from "./enhancement";
import { renderMaintenancePage } from "./maintenance";
import { loadSaverStats, renderSaverStatsPage, saverJsonError, saverWorkbook,
  saveSaverSnapshots, validSaverPayload } from "./saver";

export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  STATS_INGEST_TOKEN?: string;
  APP_TIMEZONE_OFFSET?: string;
}
function localToday(env: Env): string {
  return new Date(Date.now() + Number(env.APP_TIMEZONE_OFFSET ?? "9") * 3600_000).toISOString().slice(0, 10);
}
const router = new Router<Env>();
router.get("/", () => html(renderMaintenancePage()));
router.get("/enhancement-simulator", () => html(renderEnhancementSimulator()));
// ---------------------------------------------------------------- SaverStats
router.get("/saver-stats", () => html(renderSaverStatsPage()));

function dateQuery(value: string | null): string | undefined {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

router.get("/api/saver-stats", async (c) => {
  const from = dateQuery(c.query("from"));
  const to = dateQuery(c.query("to"));
  if ((c.query("from") && !from) || (c.query("to") && !to)) {
    return saverJsonError("日付は YYYY-MM-DD 形式で指定してください");
  }
  if (from && to && from > to) return saverJsonError("開始日は終了日以前にしてください");
  return json(await loadSaverStats(c.env.DB, from, to));
});

async function sameSecret(left: string, right: string): Promise<boolean> {
  const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(value),
  ));
  const [a, b] = await Promise.all([digest(left), digest(right)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

router.post("/api/saver-stats/ingest", async (c) => {
  const configured = c.env.STATS_INGEST_TOKEN;
  const supplied = c.req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!configured || !supplied || !(await sameSecret(configured, supplied))) {
    return saverJsonError("認証に失敗しました", 401);
  }
  const payload = await c.json<unknown>();
  if (!validSaverPayload(payload)) return saverJsonError("取得データの形式が正しくありません");
  await saveSaverSnapshots(c.env.DB, payload);
  return json({ ok: true, saved: payload.length });
});

router.get("/saver-stats/export.xlsx", async (c) => {
  const data = await loadSaverStats(c.env.DB);
  const today = localToday(c.env);
  return new Response(saverWorkbook(data), { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="saver-stats-${today}.xlsx"`,
    "Cache-Control": "no-store",
  }});
});


router.get("/healthz", () => text("ok"));
router.get("/favicon.ico", () => new Response(null, { status: 204 }));

// Only the assets required by the two active tools can be served.
const activeAsset = /^(?:\/app\.css|\/saver-stats\.js|\/class-colors\.md|\/class-button\/[A-Z]{2}\.svg|\/enhancement(?:-engine|-worker)?\.js|\/enhancement\.css|\/enhancement\/[a-zA-Z0-9_.-]+)$/;
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      const response = await router.handle(req, env);
      if (response) {
        response.headers.set("Cache-Control", "no-store");
        return response;
      }
      const path = new URL(req.url).pathname;
      if ((req.method === "GET" || req.method === "HEAD") && activeAsset.test(path) && env.ASSETS) {
        return env.ASSETS.fetch(req);
      }
      return path.startsWith("/api/")
        ? json({ ok: false, error: "税収シミュレーターはメンテナンス中です。" }, 410)
        : text("Not Found", 404);
    } catch (error) {
      console.error("Request failed", error);
      return json({ ok: false, error: "データの取得・処理に失敗しました。時間をおいて再度お試しください。" }, 500);
    }
  },
};
