// 公開作業を自動でまとめて進めるスクリプト。
// 使い方: このフォルダで `node setup.mjs` を実行するだけ。
// （セットアップ実行.bat をダブルクリックしても同じことが起きます）

import { execSync } from "node:child_process";
import fs from "node:fs";

function run(cmd, { capture = false } = {}) {
  console.log(`\n> ${cmd}`);
  return execSync(cmd, {
    stdio: capture ? ["inherit", "pipe", "inherit"] : "inherit",
    encoding: "utf8",
    shell: true,
  });
}

console.log("======================================");
console.log(" 拠点戦・税収管理ボード セットアップ");
console.log("======================================");

console.log("\n[1/6] 必要な部品をインストールします...");
run("npm install");

console.log("\n[2/6] Cloudflareにログインします。ブラウザが開くので、ログインして許可してください。");
run("npx wrangler login");

const tomlPath = "wrangler.toml";
let toml = fs.readFileSync(tomlPath, "utf8");
const PLACEHOLDER = "00000000-0000-0000-0000-000000000000";

if (toml.includes(PLACEHOLDER)) {
  console.log("\n[3/6] データベースを作成します...");
  let out = "";
  try {
    out = run("npx wrangler d1 create kyoten", { capture: true });
  } catch (e) {
    // 既に同名DBがある場合などはエラーメッセージにIDが出ることがあるので拾う
    out = String(e.stdout || "") + String(e.stderr || "");
    console.log(out);
  }
  console.log(out);
  const m = out.match(/database_id\s*=\s*"([0-9a-fA-F-]{36})"/);
  if (m) {
    toml = toml.replace(PLACEHOLDER, m[1]);
    fs.writeFileSync(tomlPath, toml);
    console.log(`→ wrangler.toml にデータベースID (${m[1]}) を自動で書き込みました。`);
  } else {
    console.log("\n⚠ データベースIDを自動で読み取れませんでした。");
    console.log("  上に表示された database_id = \"xxxxxxxx-...\" の値を、");
    console.log("  wrangler.toml の database_id = \"00000000-...\" の行に手動で貼り替えてから、");
    console.log("  もう一度 `node setup.mjs` を実行してください。");
    process.exit(1);
  }
} else {
  console.log("\n[3/6] データベースは設定済みのようです（スキップ）");
}

console.log("\n[4/6] 表（テーブル）と初期データ（拠点37件・ギルド101件）を入れます...");
run("npx wrangler d1 migrations apply kyoten --remote");

console.log("\n[5/6] 編集用パスワードを設定します。");
console.log("  このパスワードを知っている人だけが、対戦結果などを入力・編集できます。");
console.log("  これから入力を求められるので、好きなパスワードを決めて入力してください。");
try {
  run("npx wrangler secret put EDIT_PASSWORD");
} catch (e) {
  console.log("\n⚠ パスワード設定でエラーが出ました。あとで手動で `npx wrangler secret put EDIT_PASSWORD` を実行してください。");
}

console.log("\n[6/6] 公開します...");
run("npx wrangler deploy");

console.log("\n======================================");
console.log(" 完了しました！");
console.log(" 上に表示された https://... のURLをギルドの皆さんに共有してください。");
console.log("======================================");
