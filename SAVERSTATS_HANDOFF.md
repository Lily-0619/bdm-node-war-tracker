# SaverStats 自動取得機能 — 引き継ぎメモ

更新日: 2026-09-10  
対象ブランチ: `main`

## 完了していること

- Cloudflare D1へSaverStats用テーブルを追加済み（`migrations/0003_saver_stats.sql`）
- GitHub Actionsによる毎日実行を追加済み（`.github/workflows/collect-saver-stats.yml`）
- DBankへの自動ログイン成功
- DBank内の `Settings → View Server → Server Stats` への自動移動成功
- TOTAL PLAYERS、ACTIVE PLAYERS、TOTAL GUILDS、ACTIVE GUILDSの画面読み取りまで確認済み
- 既存のサイトデータは削除・置換していない

## 現在の未完了箇所

`scripts/collect_saver_stats.py` の `extract_classes()`。

Main Class Popularity (Top 1000) の職名候補は取得できているが、現在拾っている数値の合計が約276で、Top1000の人数データになっていない。そのため、誤データをD1へ保存しないよう合計値検証で停止している。

DBankの職グラフは次の構造だった。

- 独自SVG
- ApexCharts、Highcharts、Chart.js、ECharts、Plotlyではない
- 最大SVGには多数の `text`、`path`、少数の `aria-label` がある
- 別のデータAPIは確認できず、認証後HTML内に直接描画されている

## 次に行う作業

1. `extract_classes()` でTop1000グラフのSVGを特定する。
2. 各職のSVG要素をホバーまたはクリックし、表示されるツールチップから職名と人数を取得する。
3. 全職の人数合計が900〜1100になることを確認する。
4. ASIA、EUROPE、AMERICAの3地域を連続取得する。
5. `STATS_INGEST_URL`へ送信し、D1へ3地域分が保存されたことを確認する。
6. 公開サイトのSaverStats画面・期間指定グラフ・Excel出力を確認する。

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
