# 第1期 保管資料

2026-10-30に税収Web第1期をクローズ。マップ・税収計算・画面・旧設定はこのフォルダで保管します。publicおよび現行srcから読み込まれません。

本番D1のnodes/guilds/battles/battle_participants/initial_holdings/settingsは保存したまま、現行Workerにはそれらの読み書き経路を持たせていません。SaverStatsのテーブルは継続利用します。

クローズ前に取得した全DB SQLとソースZIP、最新リザルトはローカルの第1期保存パッケージに格納しています。DBバックアップを公開リポジトリやpublicに置かないでください。

## 復元

1. 現行DBとコードを再バックアップする。
2. ここに保存されたファイルを対応する元のパスへ戻す。src/router.tsとsrc/xlsx.tsは共有部品として現行srcに残っています。
3. src/maintenance.tsを削除し、wrangler.tomlのrun_worker_first設定をクローズ前に戻す。
4. 本番DBは旧6テーブルを保持しているため、検証後に再利用する。過去のSQLバックアップを現行DBへ丸ごと上書きしない（新しいSaverStatsが失われるため）。
5. 型チェック・旧計算の検証・デプロイを実施。自動同期workflowは必要な場合にのみ.github/workflowsへ戻す。

新シーズンを追加する場合は旧テーブルをそのまま使わず、期を分離したスキーマを設計してください。
