# SaverStats 自動取得機能 — 引き継ぎメモ

更新日: 2026-09-10  
対象ブランチ: `main`

## 完了していること

- Cloudflare D1へSaverStats用テーブルを追加済み（`migrations/0003_saver_stats.sql`）
- GitHub Actionsによる毎日実行を追加済み（`.github/workflows/collect-saver-stats.yml`）
- DBankへの自動ログイン成功
- DBank内の `Settings → View Server → Server Stats` への自動移動成功
- `#viewserver` を指定し、ASIA / EUROPE / AMERICAを確実に切り替えるよう修正済み
- TOTAL PLAYERS、ACTIVE PLAYERS、TOTAL GUILDS、ACTIVE GUILDSを「数値 → ラベル」のDOM順で取得
- Main Class Popularity (Top 1000) をamCharts 4の元データから取得
- 3地域の連続ドライラン成功（クラス合計: ASIA 997 / EUROPE 992 / AMERICA 964）
- `.env` のBOM付きUTF-8読込と、ログイン前例外時の診断処理を修正
- 既存のサイトデータは削除・置換していない

## 現在の未完了箇所

ローカルの収集・検証は完了。GitHub Actionsでの実送信と公開サイト確認が未完了。
この端末のGitHub CLIトークンは無効になっているため、再認証またはGitHub Web UIからの
手動実行が必要。

## 次に行う作業

1. 変更をGitHubへ反映する。
2. GitHub Actionsの `Collect SaverStats` を手動実行する。
3. `STATS_INGEST_URL`への送信成功と、D1へ3地域分が保存されたことを確認する。
4. 公開サイトのSaverStats画面・期間指定グラフ・Excel出力を確認する。

## 再開方法

別PCでリポジトリを取得または更新する。

```powershell
git clone https://github.com/Lily-0619/bdm-node-war-tracker.git
# 既に取得済みの場合
git pull origin main
```

GitHub Actionsの `Collect SaverStats` を手動実行して確認する。

直近の検証Run: [Collect SaverStats #17](https://github.com/Lily-0619/bdm-node-war-tracker/actions/runs/34454440624)

## 設定済みの秘密情報

GitHub Actions Secretsとして以下を使用する。値そのものはコードやこの文書へ記載しない。

- `DBONK_USERNAME`
- `DBONK_PASSWORD`
- `STATS_INGEST_URL`
- `STATS_INGEST_TOKEN`

Cloudflare Worker側では `STATS_INGEST_TOKEN` をSecretとして使用する。
