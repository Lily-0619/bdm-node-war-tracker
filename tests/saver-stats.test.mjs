import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { DatabaseSync } from "node:sqlite";
import vm from "node:vm";

const source = readFileSync(new URL("../src/saver.ts", import.meta.url), "utf8");
const loader = source.slice(source.indexOf("export async function loadSaverStats"), source.indexOf("export function saverWorkbook"));
const loadSaverStats = new Function(stripTypeScriptTypes(loader.replace("export ", "")) + "; return loadSaverStats;")();
const sqlite = new DatabaseSync(":memory:");
sqlite.exec(readFileSync(new URL("../migrations/0003_saver_stats.sql", import.meta.url), "utf8"));
const insert = sqlite.prepare("INSERT INTO saver_stats_snapshots (id,server,captured_date,captured_at,total_players,active_players,total_guilds,active_guilds) VALUES (?,?,?,?,1000,900,100,80)");
const insertClass = sqlite.prepare("INSERT INTO saver_stats_classes VALUES (?,?,?,?)");
for (let i = 0; i < 1200; i++) {
  const date = new Date(Date.UTC(2025, 0, 1 + Math.floor(i / 3))).toISOString().slice(0, 10);
  insert.run(i + 1, ["ASIA", "EUROPE", "AMERICA"][i % 3], date, date);
  insertClass.run(i + 1, "Warrior", 1000, 0);
}
const calls = [];
const db = {
  prepare(sql) {
    let params = [];
    return {
      bind(...values) {
        if (values.length > 100) throw new Error("D1_ERROR: too many SQL variables");
        params = values;
        return this;
      },
      async all() {
        calls.push({ sql, count: params.length });
        return { results: sqlite.prepare(sql).all(...params) };
      },
    };
  },
};
const all = await loadSaverStats(db);
assert.equal(all.snapshots.length, 1200);
assert.equal(all.classes.length, 1200);
assert.equal(calls.length, 2);
assert.ok(calls.every(call => call.count <= 2));
const range = await loadSaverStats(db, "2025-02-01", "2025-03-31");
assert.equal(range.snapshots.length, 59 * 3);
assert.equal(range.classes.length, range.snapshots.length);
assert.deepEqual(new Set(range.classes.map(row => row.snapshot_id)), new Set(range.snapshots.map(row => row.id)));
const empty = await loadSaverStats(db, "2024-01-01", "2024-01-02");
assert.deepEqual(empty, { snapshots: [], classes: [] });

// An HTML error response should yield a useful message without attempting JSON parsing.
const nodes = new Map();
const element = id => {
  if (!nodes.has(id)) nodes.set(id, { value: "", hidden: true, textContent: "" });
  return nodes.get(id);
};
let parsedHtml = false;
vm.runInNewContext(readFileSync(new URL("../public/saver-stats.js", import.meta.url), "utf8"), {
  document: { getElementById: element },
  URLSearchParams,
  fetch: async () => ({
    status: 500, ok: false, headers: { get: () => "text/html; charset=utf-8" },
    json: async () => { parsedHtml = true; throw new SyntaxError("Unexpected token '<'"); },
  }),
});
await new Promise(resolve => setImmediate(resolve));
assert.equal(parsedHtml, false);
assert.equal(element("stats-error").hidden, false);
assert.match(element("stats-error").textContent, /HTTP 500/);
sqlite.close();
console.log("PASS: 1200 snapshots, date range, empty range, HTML error response");
