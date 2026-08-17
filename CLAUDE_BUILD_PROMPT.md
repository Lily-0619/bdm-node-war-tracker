# Claude向け実装プロンプト

あなたは既存のGoogleスプレッドシートで運用されている「黒い砂漠モバイル 拠点戦・攻城戦管理」を、GitHubで管理可能なWebアプリへ再構築してください。

## 最優先

Excelのセル・行番号・HSTACK・XLOOKUPをそのまま移植しないでください。Excelは仕様確認用です。Web版では、正規化されたレコードとDBクエリで同じ業務結果を再現してください。

## 参照順

1. README_FIRST.md
2. docs/01_legacy_system_overview.md
3. docs/02_business_rules.md
4. docs/03_data_dictionary.md
5. docs/04_web_rebuild_design.md
6. docs/05_migration_questions.md
7. schema/schema.sql
8. config/*.json
9. data/*.csv

## 実装の必須条件

- GitHubでコード履歴を管理できること。
- データと計算ロジックとUIを分離すること。
- Cloudflare Workers / Pages + D1 のような構成を第一候補としてよい。
- 通常拠点戦は1戦=1レコードで管理すること。
- 攻城戦はカルフェオン/バレンシアを別レコードで管理すること。
- ギルド名・拠点名を文字列だけで連結せずID化すること。ただし移行時のraw文字列も残すこと。
- `x` は特殊センチネルとして旧挙動を維持すること。
- 未確定状態を `#N/A` で表現しないこと。`draft/complete/pending/resolved` 等の明示状態を使うこと。
- 入力完了後に、放棄日・保有日数・税日数を再計算できること。
- 過去データの編集時は、その日以降の影響範囲を再計算すること。
- 旧版との比較テストに `data/legacy_expected_results.csv` を使用すること。

## まず作るMVP

1. D1スキーマ
2. CSVインポート
3. ギルド/拠点マスタ管理
4. 日付別入力画面
5. 通常拠点戦・攻城戦入力
6. 放棄日/保有日数/税日数の計算
7. 旧Excelとのgolden test
8. 結果一覧
9. 税収一覧

UIを凝るのは計算一致後にしてください。

## 注意

`docs/05_migration_questions.md` に「人間確認が必要な曖昧点」があります。そこは推測で仕様確定しないでください。実装上は設定値や互換モードで差し替え可能にしてください。
