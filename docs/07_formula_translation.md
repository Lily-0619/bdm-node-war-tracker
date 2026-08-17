# 07. 代表数式とWebへの置換

完全な数式そのものは `config/formula_samples.json` を参照。

## XLOOKUP

旧: 日付から入力シートのセルをXLOOKUP。

新: `node_war_results` 自体が入力データなので不要。

## HSTACK 勝者一覧

旧: 各枠の勝者セルを横にHSTACKし、COUNTIFで未来を探索。

新: `winner_guild_id` にインデックスを貼り、日付範囲検索。

## 放棄日 IFS

旧: +1〜+6日をCOUNTIFで列挙。

新（概念）:

```sql
SELECT MIN(battle_date)
FROM all_winner_events
WHERE winner_guild_id = ?
  AND battle_date > ?
  AND battle_date <= date(?, '+6 day');
```

見つからず、必要期間がcompleteなら acquired_date + 7日。

## 税

旧: 7行前の放棄日を直接参照。

新: 同じnode_idの直前結果を検索し、そのrelease_dateを使う。
