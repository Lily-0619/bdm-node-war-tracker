# 04. Web再構築の推奨設計

## 推奨構成

- GitHub: ソースコード・migration・テスト履歴
- Cloudflare Pages/Workers: UI/API
- Cloudflare D1: 永続データ

必須ではないが、この規模なら扱いやすい構成。

## レイヤ分離

### Source data

`guilds / nodes / node_schedule / battle_days / node_war_results / siege_results`

### Calculation service

- `findNextAcquisition(winner, acquiredDate)`
- `calculateReleaseDate(result)`
- `calculateHoldingDays(result)`
- `calculateTaxDays(result)`
- `recalculateFrom(date)`

### UI

- 日付別入力
- 結果一覧
- 税収一覧
- ギルド履歴
- 拠点履歴
- マスタ管理

## 重要: 過去編集時の再計算

例えば過去の勝者を修正すると、そのギルドの前後の放棄日、保有日数、税に波及する。

そのため保存時は、最低でも **編集日以降の関連結果を再計算**する。初期実装では安全側に倒して「編集日から最新まで再計算」でもよい。

## スケジュールのバージョン管理

現行データには入力レイアウトと拠点マスタの曜日不一致が存在する。`node_schedule` を別テーブルにして `effective_from/effective_to` を持たせれば、将来の曜日変更にも対応できる。

## 入力UI

人間には現在のExcelに近い「曜日ごとのカード/枠」表示をしてもよいが、保存形式は1戦1レコードにする。

UIの見た目とDB構造を分離すること。
