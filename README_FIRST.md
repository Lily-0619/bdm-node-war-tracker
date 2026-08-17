# 拠点戦Web化 — Claude引継ぎ一式

このフォルダは、現行Googleスプレッドシート **「拠点戦まとめ_鯖統合 の編集用」** の計算思想・マスタ・入力履歴・旧計算結果を、Webアプリへ再構築するために整理した引継ぎパッケージです。

## Claudeに最初に読ませる順番

1. `CLAUDE_BUILD_PROMPT.md`
2. `docs/01_legacy_system_overview.md`
3. `docs/02_business_rules.md`
4. `docs/03_data_dictionary.md`
5. `docs/04_web_rebuild_design.md`
6. `docs/05_migration_questions.md`
7. `schema/schema.sql`
8. `data/legacy_expected_results.csv`

## 一番重要な方針

- Excelのセル構造をWebへ再現しない。
- 引き継ぐのは **計算ルールとデータ**。
- `data/legacy_expected_results.csv` を旧版の「正解値（golden data）」として、新実装の計算結果と比較する。
- `#N/A` は旧Excelで「未確定」を表すためにも使われていた。Web版では `pending` のような状態値に置き換える。
- `x` は通常ギルドではなく特殊センチネル。意味を勝手に決めず、既存挙動を維持する。

## 含まれるデータ

- ギルドマスタ: **102件**
- 拠点マスタ: **35件**
- 入力レイアウト上の拠点: **35件**
- 正規化した通常拠点戦レコード（勝者あり）: **1791件**
- 勝者未入力の部分入力: **52件**
- 正規化した攻城戦レコード: **58件**
- 旧DBの計算結果（比較用）: **1791件**
- 最終勝者入力日: **2026-08-16**
- 何らかの入力が存在する最終日（将来の統一/宴会先行入力を含む）: **2026-08-23**

## フォルダ

- `data/` 移行用CSV・旧版期待値
- `config/` 旧ロジック・スケジュール・代表数式
- `schema/` D1/SQLite向けDB案
- `docs/` 人間向け仕様説明
- `source/` 解析時点の現行xlsx書き出し
