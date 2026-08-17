# 03. データ辞書

## data/guild_master.csv

- `guild_name`: 入力プルダウンに使われている名称。
- `note`: 現行の補助メモ。
- `is_sentinel`: `x` のみ true。

## data/node_master.csv

- `node_name`: 拠点名。
- `legacy_time_code`: 現行の内部時間コード（19/21）。意味はそのまま保持。
- `weekday_master`: 計算用マスタに書かれた曜日。
- `tier`: 1/2/3。
- `group_code`: 3, 2A, 2B...等。
- `fortress`: 城塞/-。
- `capacity`: 人数。
- `max_battle_count`: 最大対戦/入札枠として使われる値。
- `effect`: 拠点効果。
- `weekday_input_layout`, `slot_input_layout`: 実際の入力UI上の配置から逆算。
- `weekday_conflict`: 計算用マスタと入力UIの曜日が違う場合 true。

## data/regular_battles_normalized.csv

Web移行の中心データ。1行=通常拠点戦1件。

- `date`, `weekday`
- `slot`
- `node_name`
- `winner`
- `battle_count`
- `unified`
- `banquet`
- `node_mapping_status`

## data/siege_battles_normalized.csv

1行=1領地の攻城戦。

- `territory`: カルフェオン/バレンシア
- `winner`
- `attacker1`, `attacker2`

## data/legacy_expected_results.csv

旧DBが実際に返していた計算値。新実装のgolden test用。

- `tax_days`
- `holding_days`
- `release_date`
- `calculation_status`

**新コードが正しいかどうかは、このCSVとの一致をまず確認する。**

## data/legacy_input_wide.csv

現行入力を、Excel列記号ではなく意味のある列名に変換したワイド形式。移行トラブル時の原本照合用。

## data/migration_audit.csv

自動解析で見つかった曖昧点/不整合。無視せず確認する。
