# 06. 移行・テスト計画

## Step 1: マスタ取込

`guild_master.csv` と `node_master.csv` を新DBへ投入。

## Step 2: スケジュール確定

`input_slot_mapping.csv` を暫定正として取り込み、`migration_audit.csv` の曜日競合を人間確認。

## Step 3: 履歴取込

- `regular_battles_normalized.csv`
- `siege_battles_normalized.csv`

を投入。

## Step 4: 計算

Web側で全履歴の放棄日・保有日数・tax_daysを計算。

## Step 5: Golden test

`legacy_expected_results.csv` の resolved 行と、新実装の計算結果を比較する。

最低比較キー:

`date + slot + winner`

比較値:

`release_date + holding_days + tax_days`

## Step 6: 差分分類

差分を以下に分類する。

- 新実装バグ
- 旧Excelの未確定 (#N/A)
- `x` 特殊処理
- 曜日/スケジュール競合
- 旧データ入力漏れ

## Step 7: 並行運用

数週間、旧ExcelとWeb版を同時入力または比較し、一致確認後にWeb版を主運用にする。
