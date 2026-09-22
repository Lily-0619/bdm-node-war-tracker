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

const boosterOptions = `<option value="none">使用しない</option><option value="valksI">ヴォルクスI ×1.1</option><option value="akhramV">アクラムV ×1.5</option><option value="valksV">ヴォルクスV ×1.5</option><option value="akhramX">アクラムX ×2.0</option>`;

export function renderEnhancementSimulator(): string {
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>闇の精霊 強化シミュレーター</title><link rel="stylesheet" href="/enhancement.css"></head>
  <body><header class="sim-header"><a href="/" class="sim-back">‹ 税収画面へ</a><div><b>闇の精霊 強化シミュレーター</b><small>装備・トーテム強化計画</small></div><span class="rule-version">RULE <b id="rule-version">読込中</b></span></header>
  <main class="sim-page">
    <section class="sim-toolbar"><div class="system-switch"><button class="active" data-system="equipment">装備</button><button data-system="totem">トーテム</button></div><div class="sim-actions"><button id="new-calculation" type="button">新規計算</button><button id="load-config" type="button">保存条件を読込</button></div></section>
    <section class="equipment-stage">
      <div class="mist mist-a"></div><div class="mist mist-b"></div>
      <div class="stage-copy"><span>ENHANCEMENT CHAMBER</span><h1>強化する装備を選択</h1><p>装備またはトーテムを選ぶと、条件設定とシミュレーションを開始できます。</p></div>
      <div class="character-wrap"><div class="character-halo"></div><img src="/enhancement/character-silhouette.webp" alt="暗い人物シルエット"></div>
      <div class="equipment-panel"><h2>装備</h2><div class="slot-grid equipment-grid">${slots.map(gearButton).join("")}</div></div>
      <div class="accessory-panel"><h2>アクセサリー <small>今後追加</small></h2><div class="slot-grid accessory-grid">${accessories.map(accessoryButton).join("")}</div></div>
      <button class="totem-slot" data-item="totem" data-name="トーテム"><span class="totem-level">+9</span><span class="totem-glow"></span><img src="/enhancement/raven-totem.webp" alt="鳥型トーテム"><span><b>トーテム</b><small>強化シミュレーション</small></span></button>
    </section>
  </main>

  <dialog id="enhancement-dialog" class="enhancement-dialog"><form method="dialog" class="dialog-shell" id="sim-form"><header><div><small id="dialog-type">EQUIPMENT</small><h2 id="dialog-title">メイン武器</h2></div><button class="dialog-close" value="cancel" aria-label="閉じる">×</button></header>
    <nav class="dialog-tabs"><button type="button" class="active" data-tab="state">現在状態・所持資源</button><button type="button" data-tab="policy">使用方針・市場価格</button><button type="button" data-tab="result">計算結果・分布</button></nav>
    <div id="validation-message" class="validation-message" hidden></div>

    <section class="dialog-pane active" data-pane="state">
      <div class="form-grid common-fields">
        <label>現在段階<input id="current-stage" data-config type="number" value="9" min="0" max="9"></label>
        <label>目標段階<input id="target-stage" data-config type="number" value="10" min="1" max="10"></label>
        <label>作成個数<input id="quantity" data-config type="number" value="1" min="1" max="20"></label>
        <label>試行回数<select id="trials" data-config><option value="100">100（動作確認）</option><option value="1000" selected>1,000（プレビュー）</option><option value="10000">10,000（比較）</option></select></label>
        <label>乱数シード<input id="seed" data-config type="number" value="20260922" step="1"></label>
        <label>1試行の最大強化回数<input id="max-attempts" data-config type="number" value="10000000" min="1"></label>
        <label>開始日<input id="start-date" data-config type="date" value="2026-09-22"></label>
        <label>目標日<input id="target-date" data-config type="date" value="2026-12-31"></label>
        <label>1日あたり稼働時間<input id="daily-hours" data-config type="number" value="24" min="0" max="24" step="0.1"></label>
        <label>予算上限（0＝無制限）<input id="budget" data-config type="number" value="0" min="0"></label>
      </div>

      <div data-system-block="equipment">
        <h3>装備の天井進捗</h3><div class="compact-grid">
          <label>+7→+8<input id="eq-pity-7" data-config type="number" value="11" min="0" max="17"></label>
          <label>+8→+9<input id="eq-pity-8" data-config type="number" value="0" min="0" max="50"></label>
          <label>+9→+10<input id="eq-pity-9" data-config type="number" value="13" min="0" max="100"></label>
        </div>
        <h3>装備の所持資源</h3><div class="compact-grid inventory-grid">
          <label>専用強化石<input id="eq-stone" data-config type="number" value="370000" min="0"></label>
          <label>突破復旧券<input id="eq-tickets" data-config type="number" value="4200000" min="0"></label>
          <label>ヴォルクスI<input id="eq-valks-i" data-config type="number" value="18600" min="0"></label>
          <label>アクラムV<input id="eq-akhram-v" data-config type="number" value="68769" min="0"></label>
          <label>ヴォルクスV <small>未確認</small><input id="eq-valks-v" data-config type="number" placeholder="未入力" min="0"></label>
          <label>アクラムX<input id="eq-akhram-x" data-config type="number" value="15577" min="0"></label>
        </div>
      </div>

      <div data-system-block="totem" hidden>
        <h3>全トーテム共通の天井進捗</h3><div class="compact-grid">
          <label>+7→+8<input id="totem-pity-7" data-config type="number" value="5" min="0" max="17"></label>
          <label>+8→+9<input id="totem-pity-8" data-config type="number" value="16" min="0" max="50"></label>
          <label>+9→+10<input id="totem-pity-9" data-config type="number" value="14" min="0" max="100"></label>
        </div>
        <h3>トーテムの所持資源</h3><div class="compact-grid">
          <label>凸素材<input id="totem-material" data-config type="number" placeholder="現在数を入力" min="0"></label>
          <label>オギエール<input id="totem-ogier" data-config type="number" placeholder="現在数を入力" min="0"></label>
        </div>
      </div>
    </section>

    <section class="dialog-pane" data-pane="policy">
      <div data-system-block="equipment">
        <h3>復旧券を使う区間</h3><div class="check-row"><label><input id="restore-7" data-config type="checkbox" checked> +7→+8</label><label><input id="restore-8" data-config type="checkbox" checked> +8→+9</label><label><input id="restore-9" data-config type="checkbox" checked> +9→+10</label></div>
        <h3>成功率補助アイテム</h3><div class="compact-grid booster-grid">
          <label>+5→+6<select id="booster-5" data-config>${boosterOptions}</select></label>
          <label>+6→+7<select id="booster-6" data-config>${boosterOptions}</select></label>
          <label>+7→+8<select id="booster-7" data-config>${boosterOptions}</select></label>
          <label>+8→+9<select id="booster-8" data-config>${boosterOptions}</select></label>
          <label>+9→+10<select id="booster-9" data-config>${boosterOptions}</select></label>
        </div>
        <label class="wide-check"><input id="consume-guaranteed" data-config type="checkbox"> 天井確定挑戦でも補助アイテムを消費する</label>
        <h3>資源評価単価</h3><div class="compact-grid">
          <label>強化石1個<input id="stone-valuation" data-config type="number" value="0" min="0"></label>
          <label>復旧券1枚<input id="ticket-valuation" data-config type="number" value="528" min="0"></label>
        </div>
      </div>

      <div data-system-block="totem" hidden>
        <div class="check-row"><label><input id="craft-seven" data-config type="checkbox"> +6で+7確定作製を使う</label><label><input id="use-ogier" data-config type="checkbox" checked> +9→+10でオギエールを使う</label></div>
        <label class="single-field">+7確定作製の手作業時間（秒）<input id="craft-seconds" data-config type="number" placeholder="未入力" min="0"></label>
        <h3>凸素材の市場条件</h3><div class="market-grid">
          <label>現在単価<input id="material-price" data-config type="number" value="425" min="0"></label>
          <label>評価単価<input id="material-valuation" data-config type="number" value="425" min="0"></label>
          <label>購入上限単価<input id="material-limit" data-config type="number" value="450" min="0"></label>
          <label>購入可能数 <small>空欄＝無制限</small><input id="material-purchasable" data-config type="number" min="0"></label>
          <label class="wide-check"><input id="material-buy" data-config type="checkbox" checked> 上限以下なら不足分を購入する</label>
        </div>
        <h3>オギエールの市場条件</h3><div class="market-grid">
          <label>現在単価<input id="ogier-price" data-config type="number" value="12500000" min="0"></label>
          <label>評価単価<input id="ogier-valuation" data-config type="number" value="12500000" min="0"></label>
          <label>購入上限単価<input id="ogier-limit" data-config type="number" value="13000000" min="0"></label>
          <label>購入可能数 <small>空欄＝無制限</small><input id="ogier-purchasable" data-config type="number" min="0"></label>
          <label class="wide-check"><input id="ogier-buy" data-config type="checkbox"> 上限以下なら不足分を購入する</label>
        </div>
      </div>
    </section>

    <section class="dialog-pane" data-pane="result">
      <div id="result-empty" class="result-empty"><b>条件を入力してシミュレーションを開始してください</b><p>平均だけでなく、中央値・P90・P95・在庫切れ率を表示します。</p></div>
      <div id="result-output" hidden>
        <div class="result-cards"><article><small>平均</small><b id="result-mean">—</b></article><article><small>中央値</small><b id="result-median">—</b></article><article><small>P90</small><b id="result-p90">—</b></article><article><small>P95</small><b id="result-p95">—</b></article></div>
        <div class="result-meta" id="result-meta"></div>
        <div class="result-chart-wrap"><svg id="result-chart" viewBox="0 0 760 210" role="img" aria-label="消費量の分布"></svg></div>
        <div class="result-table-grid">
          <table class="result-table"><caption>費用・時間</caption><tbody id="cost-results"></tbody></table>
          <table class="result-table"><caption>達成・リスク</caption><tbody id="risk-results"></tbody></table>
        </div>
        <div id="result-warnings" class="result-warnings"></div>
      </div>
    </section>
    <footer><span id="simulation-status">入力条件と結果はこのブラウザに保存できます</span><button id="save-config" type="button" class="secondary-button">条件を保存</button><button id="simulate" type="button" class="simulate-button">シミュレーション開始</button></footer>
  </form></dialog><script type="module" src="/enhancement.js"></script></body></html>`;
}
