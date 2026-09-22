const slots = [
  ["main", "メイン武器", 0, 0],
  ["sub", "補助武器", 1, 0],
  ["helmet", "ヘルム", 2, 0],
  ["armor", "アーマー", 0, 1],
  ["gloves", "グローブ", 1, 1],
  ["shoes", "シューズ", 2, 1],
] as const;

const accessories = [
  ["ring", "リング", "◇"],
  ["necklace", "ネックレス", "♢"],
  ["belt", "ベルト", "▰"],
  ["earring", "イヤリング", "◈"],
  ["bracelet", "ブレスレット", "◎"],
] as const;

function gearButton([key, name, column, row]: typeof slots[number]): string {
  return `<button class="sim-slot gear-slot" data-item="${key}" data-name="${name}" style="--sprite-x:${column};--sprite-y:${row}">
    <span class="sim-level">+9</span><span class="gear-art" aria-hidden="true"></span><span class="slot-name">${name}</span>
  </button>`;
}

function accessoryButton([key, name, symbol]: typeof accessories[number]): string {
  return `<button class="sim-slot accessory-slot is-future" data-item="${key}" data-name="${name}" disabled>
    <span class="future-symbol" aria-hidden="true">${symbol}</span><span class="slot-name">${name}</span><small>今後追加</small>
  </button>`;
}

export function renderEnhancementSimulator(): string {
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>闇の精霊 強化シミュレーター</title><link rel="stylesheet" href="/enhancement.css"></head>
  <body><header class="sim-header"><a href="/" class="sim-back">‹ 税収画面へ</a><div><b>闇の精霊 強化シミュレーター</b><small>装備・トーテム強化計画</small></div><span class="rule-version">RULE 2026-09-22</span></header>
  <main class="sim-page">
    <section class="sim-toolbar"><div class="system-switch"><button class="active" data-system="equipment">装備</button><button data-system="totem">トーテム</button></div><div class="sim-actions"><button id="reset-levels" type="button">+9に戻す</button><button type="button" disabled title="計算機能の実装時に追加します">保存条件を読込</button></div></section>
    <section class="equipment-stage">
      <div class="mist mist-a"></div><div class="mist mist-b"></div>
      <div class="stage-copy"><span>ENHANCEMENT CHAMBER</span><h1>強化する装備を選択</h1><p>装備またはトーテムを選ぶと、条件設定の窓が開きます。</p></div>
      <div class="character-wrap"><div class="character-halo"></div><img src="/enhancement/character-silhouette.webp" alt="暗い人物シルエット"></div>
      <div class="equipment-panel"><h2>装備</h2><div class="slot-grid equipment-grid">${slots.map(gearButton).join("")}</div></div>
      <div class="accessory-panel"><h2>アクセサリー <small>今後追加</small></h2><div class="slot-grid accessory-grid">${accessories.map(accessoryButton).join("")}</div></div>
      <button class="totem-slot" data-item="totem" data-name="トーテム"><span class="totem-level">+9</span><span class="totem-glow"></span><img src="/enhancement/raven-totem.webp" alt="鳥型トーテム"><span><b>トーテム</b><small>強化シミュレーション</small></span></button>
    </section>
  </main>
  <dialog id="enhancement-dialog" class="enhancement-dialog"><form method="dialog" class="dialog-shell"><header><div><small id="dialog-type">EQUIPMENT</small><h2 id="dialog-title">メイン武器</h2></div><button class="dialog-close" value="cancel" aria-label="閉じる">×</button></header>
    <nav class="dialog-tabs"><button type="button" class="active" data-tab="state">現在状態・所持資源</button><button type="button" data-tab="policy">使用方針・市場価格</button><button type="button" data-tab="result">計算結果・分布</button></nav>
    <section class="dialog-pane active" data-pane="state"><div class="form-grid"><label>現在段階<input id="current-stage" type="number" value="9" min="0" max="10"></label><label>目標段階<input type="number" value="10" min="1" max="10"></label><label>作成個数<input type="number" value="1" min="1"></label><label>試行回数<select><option>10,000（プレビュー）</option><option>100,000（通常比較）</option><option>500,000（最終判断）</option></select></label></div><div class="placeholder-card"><b>天井進捗・所持資源</b><p>数値とルールは装備・トーテム計算機能の実装時に追加します。</p></div></section>
    <section class="dialog-pane" data-pane="policy"><div class="placeholder-card large"><b>使用区間・市場価格</b><p>復旧券、補助アイテム、オギエール、購入上限などを設定する画面です。</p><div class="ghost-lines"><i></i><i></i><i></i></div></div></section>
    <section class="dialog-pane" data-pane="result"><div class="result-cards"><article><small>平均</small><b>—</b></article><article><small>中央値</small><b>—</b></article><article><small>P90</small><b>—</b></article><article><small>P95</small><b>—</b></article></div><div class="empty-chart"><span>分布グラフ</span><p>計算機能の実装後に表示します</p></div></section>
    <footer><span>UIプレビュー — 計算処理は未実装です</span><button type="button" class="simulate-button" disabled>シミュレーション開始</button></footer>
  </form></dialog><script src="/enhancement.js"></script></body></html>`;
}
