# 拠点戦 過去データ分析レポート

`data/historical/*.md` を集計して、ギルド単位・拠点単位・N人巴(タイマン〜五つ巴)単位の
分析用Excelを生成するフォルダ。「税収計算Web-report」として管理する。

## 中身

- `scripts/build_report.py` — 集計スクリプト。`data/historical`が更新されたら再実行すれば最新化される
- `output/拠点戦_過去データ分析.xlsx` — 生成結果。GitHub Actions (`sync-historical.yml`) が
  D1→historical同期のたびに自動で再生成・コミットする

## 手動での再生成

```bash
python report/scripts/build_report.py
```

## 今後の予定

各ギルドの戦闘力(CPM: Average / Max / Min / Median / Std Dev)を集計する別ツールが
できたら、`偏った対戦結果`シートと突き合わせて「実力差では説明できない勝敗」を
絞り込む分析を追加する。
