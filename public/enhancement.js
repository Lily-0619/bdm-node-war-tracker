import { validateConfig } from "./enhancement-engine.js";

(async function () {
  "use strict";
  const rules = await fetch("/enhancement/rules.json").then(response => {
    if (!response.ok) throw new Error(`ルール読込エラー: ${response.status}`);
    return response.json();
  });

  const dialog = document.getElementById("enhancement-dialog");
  const form = document.getElementById("sim-form");
  const title = document.getElementById("dialog-title");
  const type = document.getElementById("dialog-type");
  const currentStage = document.getElementById("current-stage");
  const simulateButton = document.getElementById("simulate");
  const status = document.getElementById("simulation-status");
  const validationMessage = document.getElementById("validation-message");
  const storageKey = "bdm-enhancement-levels-v1";
  const configStorageKey = "bdm-enhancement-config-v1";
  const itemButtons = [...document.querySelectorAll("[data-item]:not([disabled])")];
  let selectedButton = null;
  let worker = null;
  let levels = readJson(storageKey, {});

  document.getElementById("rule-version").textContent = rules.ruleVersion;

  function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || "") || fallback; }
    catch (_) { return fallback; }
  }

  function saveJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (_) { /* Storage may be disabled; session behavior still works. */ }
  }

  const normalizeStage = value => Math.max(0, Math.min(9, Number.parseInt(value, 10) || 0));
  const numberValue = id => Number(document.getElementById(id).value);
  const integerValue = id => Number.parseInt(document.getElementById(id).value, 10);
  const nullableNumber = id => {
    const value = document.getElementById(id).value.trim();
    return value === "" ? null : Number(value);
  };
  const checked = id => document.getElementById(id).checked;
  const levelLabel = button => button.querySelector(".sim-level, .totem-level");

  function applyDefaultPolicies() {
    document.getElementById("booster-5").value = "valksI";
    document.getElementById("booster-6").value = "akhramV";
    document.getElementById("booster-7").value = "akhramX";
    document.getElementById("booster-8").value = "akhramX";
    document.getElementById("booster-9").value = "akhramX";
  }

  itemButtons.forEach(button => {
    const key = button.dataset.item;
    levels[key] = normalizeStage(levels[key] ?? 9);
    levelLabel(button).textContent = `+${levels[key]}`;
  });
  saveJson(storageKey, levels);
  applyDefaultPolicies();

  function setSystem(system) {
    document.querySelectorAll("[data-system-block]").forEach(block => {
      block.hidden = block.dataset.systemBlock !== system;
    });
    document.querySelectorAll(".system-switch button").forEach(button => {
      button.classList.toggle("active", button.dataset.system === system);
    });
    type.textContent = system === "totem" ? "TOTEM" : "EQUIPMENT";
  }

  function showTab(name) {
    document.querySelectorAll(".dialog-tabs button").forEach(button => button.classList.toggle("active", button.dataset.tab === name));
    document.querySelectorAll(".dialog-pane").forEach(pane => pane.classList.toggle("active", pane.dataset.pane === name));
  }

  itemButtons.forEach(button => {
    button.addEventListener("click", () => {
      selectedButton = button;
      const system = button.dataset.item === "totem" ? "totem" : "equipment";
      title.textContent = button.dataset.name;
      setSystem(system);
      currentStage.value = String(levels[button.dataset.item]);
      validationMessage.hidden = true;
      showTab("state");
      dialog.showModal();
    });
  });

  currentStage.addEventListener("input", () => {
    if (!selectedButton || currentStage.value === "") return;
    const value = normalizeStage(currentStage.value);
    levels[selectedButton.dataset.item] = value;
    levelLabel(selectedButton).textContent = `+${value}`;
    saveJson(storageKey, levels);
  });

  document.querySelectorAll(".dialog-tabs button").forEach(button => button.addEventListener("click", () => showTab(button.dataset.tab)));
  document.querySelectorAll(".system-switch button").forEach(button => {
    button.addEventListener("click", () => {
      const target = button.dataset.system === "totem" ? document.querySelector(".totem-slot") : document.querySelector(".gear-slot");
      target.focus();
      target.click();
    });
  });

  function dateCapacitySeconds() {
    const start = new Date(`${document.getElementById("start-date").value}T00:00:00`);
    const target = new Date(`${document.getElementById("target-date").value}T00:00:00`);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(target.getTime()) || target < start) return 0;
    const days = Math.floor((target.getTime() - start.getTime()) / 86400000) + 1;
    return days * numberValue("daily-hours") * 3600;
  }

  function buildConfig() {
    const system = selectedButton?.dataset.item === "totem" ? "totem" : "equipment";
    const common = {
      system,
      ruleVersion: rules.ruleVersion,
      currentStage: integerValue("current-stage"),
      targetStage: integerValue("target-stage"),
      quantity: integerValue("quantity"),
      trials: integerValue("trials"),
      seed: integerValue("seed"),
      maxAttempts: integerValue("max-attempts"),
      budget: numberValue("budget"),
      availableSeconds: dateCapacitySeconds(),
    };
    if (system === "equipment") {
      const boosterByStage = Array(10).fill("none");
      for (const stage of [5, 6, 7, 8, 9]) boosterByStage[stage] = document.getElementById(`booster-${stage}`).value;
      return {
        ...common,
        pity: { 7: numberValue("eq-pity-7"), 8: numberValue("eq-pity-8"), 9: numberValue("eq-pity-9") },
        inventory: {
          stone: nullableNumber("eq-stone"), tickets: nullableNumber("eq-tickets"),
          valksI: nullableNumber("eq-valks-i"), akhramV: nullableNumber("eq-akhram-v"),
          valksV: nullableNumber("eq-valks-v"), akhramX: nullableNumber("eq-akhram-x"),
        },
        market: { stoneValuation: numberValue("stone-valuation"), ticketValuation: numberValue("ticket-valuation"), boosterValuation: {} },
        policy: {
          restorationStages: [7, 8, 9].filter(stage => checked(`restore-${stage}`)),
          boosterByStage,
          consumeBoosterOnGuaranteed: checked("consume-guaranteed"),
        },
      };
    }
    return {
      ...common,
      pity: { 7: numberValue("totem-pity-7"), 8: numberValue("totem-pity-8"), 9: numberValue("totem-pity-9") },
      inventory: { material: nullableNumber("totem-material"), ogier: nullableNumber("totem-ogier") },
      policy: { craftSeven: checked("craft-seven"), craftSeconds: nullableNumber("craft-seconds"), useOgier: checked("use-ogier") },
      market: {
        material: {
          currentPrice: numberValue("material-price"), valuationPrice: numberValue("material-valuation"),
          buyLimitPrice: numberValue("material-limit"), purchasableQuantity: nullableNumber("material-purchasable"), allowPurchase: checked("material-buy"),
        },
        ogier: {
          currentPrice: numberValue("ogier-price"), valuationPrice: numberValue("ogier-valuation"),
          buyLimitPrice: numberValue("ogier-limit"), purchasableQuantity: nullableNumber("ogier-purchasable"), allowPurchase: checked("ogier-buy"),
        },
      },
    };
  }

  function showValidation(validation) {
    const lines = [
      ...validation.errors.map(message => `<li class="error">${escapeHtml(message)}</li>`),
      ...validation.warnings.map(message => `<li>${escapeHtml(message)}</li>`),
    ];
    validationMessage.innerHTML = lines.length ? `<ul>${lines.join("")}</ul>` : "";
    validationMessage.hidden = !lines.length;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }

  function formatNumber(value, digits = 0) {
    if (value === null || value === undefined || !Number.isFinite(value)) return "—";
    return new Intl.NumberFormat("ja-JP", { maximumFractionDigits: digits }).format(value);
  }

  function formatDuration(seconds) {
    if (!Number.isFinite(seconds)) return "—";
    if (seconds < 60) return `${formatNumber(seconds, 1)}秒`;
    if (seconds < 3600) return `${formatNumber(seconds / 60, 1)}分`;
    return `${formatNumber(seconds / 3600, 1)}時間`;
  }

  function metricRow(label, summary, formatter = value => formatNumber(value, 0)) {
    return `<tr><th>${label}</th><td>${summary ? formatter(summary.mean) : "—"}</td><td>${summary ? formatter(summary.p90) : "—"}</td></tr>`;
  }

  function renderChart(bins) {
    const svg = document.getElementById("result-chart");
    if (!bins.length) { svg.innerHTML = '<text x="380" y="105" text-anchor="middle">完成試行がないため分布を表示できません</text>'; return; }
    const maxCount = Math.max(...bins.map(bin => bin.count), 1);
    const width = 700 / bins.length;
    svg.innerHTML = `<line x1="42" y1="178" x2="742" y2="178" class="axis"/>${bins.map((bin, index) => {
      const height = 145 * bin.count / maxCount;
      const x = 42 + index * width + 2;
      return `<rect x="${x}" y="${178 - height}" width="${Math.max(1, width - 4)}" height="${height}" rx="2"><title>${formatNumber(bin.from)}～${formatNumber(bin.to)}: ${bin.count}回</title></rect>`;
    }).join("")}<text x="42" y="200">${formatNumber(bins[0].from)}</text><text x="742" y="200" text-anchor="end">${formatNumber(bins.at(-1).to)}</text>`;
  }

  function renderResult(result) {
    showValidation(result.validation);
    document.getElementById("result-empty").hidden = true;
    document.getElementById("result-output").hidden = false;
    const primary = result.metrics[result.primaryKey];
    document.getElementById("result-mean").textContent = formatNumber(primary?.mean, 1);
    document.getElementById("result-median").textContent = formatNumber(primary?.median, 0);
    document.getElementById("result-p90").textContent = formatNumber(primary?.p90, 0);
    document.getElementById("result-p95").textContent = formatNumber(primary?.p95, 0);
    document.getElementById("result-meta").innerHTML = `<b>${result.primaryKey === "normalAttempts" ? "通常強化回数" : "凸素材消費数"}</b><span>完成 ${formatNumber(result.completed)} / ${formatNumber(result.trials)}回</span><span>シード ${result.seed}</span><span>ルール ${result.ruleVersion}</span>${result.exactCheck ? `<span>厳密期待値 ${formatNumber(result.exactCheck.expectedAttempts, 2)}回</span>` : ""}`;
    renderChart(result.histogram);
    document.getElementById("cost-results").innerHTML = `
      <tr><th></th><th>平均</th><th>P90</th></tr>
      ${metricRow("直接支出", result.metrics.directCost, value => `${formatNumber(value)} S`)}
      ${metricRow("資源価値", result.metrics.resourceValue, value => `${formatNumber(value)} S`)}
      ${metricRow("総シルバー換算", result.metrics.totalCost, value => `${formatNumber(value)} S`)}
      ${metricRow("機械処理時間", result.metrics.machineSeconds, formatDuration)}
      ${metricRow("復旧券", result.metrics.ticketsUsed)}
      ${metricRow("オギエール", result.metrics.ogierUsed)}
      ${metricRow("ヴォルクスI", result.metrics.valksIUsed)}
      ${metricRow("アクラムV", result.metrics.akhramVUsed)}
      ${metricRow("ヴォルクスV", result.metrics.valksVUsed)}
      ${metricRow("アクラムX", result.metrics.akhramXUsed)}`;
    document.getElementById("risk-results").innerHTML = `
      <tr><th>完成率</th><td>${formatNumber(result.completionRate * 100, 2)}%</td></tr>
      <tr><th>在庫切れ率</th><td>${formatNumber(result.inventoryFailureRate * 100, 2)}%</td></tr>
      <tr><th>予算超過率</th><td>${formatNumber(result.budgetFailureRate * 100, 2)}%</td></tr>
      <tr><th>期限超過率</th><td>${formatNumber(result.deadlineFailureRate * 100, 2)}%</td></tr>
      <tr><th>平均95%信頼区間</th><td>${primary ? `${formatNumber(primary.confidence95[0], 1)}～${formatNumber(primary.confidence95[1], 1)}` : "—"}</td></tr>`;
    document.getElementById("result-warnings").innerHTML = result.validation.warnings.map(message => `<p>⚠ ${escapeHtml(message)}</p>`).join("");
    showTab("result");
  }

  simulateButton.addEventListener("click", () => {
    const config = buildConfig();
    const validation = validateConfig(config, rules);
    showValidation(validation);
    if (validation.errors.length) { showTab("state"); return; }
    if (worker) worker.terminate();
    worker = new Worker("/enhancement-worker.js", { type: "module" });
    simulateButton.disabled = true;
    simulateButton.textContent = "計算中…";
    status.textContent = `${formatNumber(config.trials)}回をシード ${config.seed} で計算しています`;
    worker.onmessage = event => {
      simulateButton.disabled = false;
      simulateButton.textContent = "シミュレーション開始";
      if (!event.data.ok) { status.textContent = `計算エラー: ${event.data.error}`; return; }
      status.textContent = "計算完了 — 同じシードで再現できます";
      saveJson("bdm-enhancement-last-result-v1", { config, result: event.data.result, executedAt: new Date().toISOString(), method: "monte_carlo" });
      renderResult(event.data.result);
    };
    worker.onerror = event => {
      simulateButton.disabled = false;
      simulateButton.textContent = "シミュレーション開始";
      status.textContent = `計算エラー: ${event.message}`;
    };
    worker.postMessage({ config, rules });
  });

  function serializeForm() {
    return Object.fromEntries([...document.querySelectorAll("[data-config]")].map(input => [input.id, input.type === "checkbox" ? input.checked : input.value]));
  }

  function restoreForm(values) {
    for (const [id, value] of Object.entries(values || {})) {
      const input = document.getElementById(id);
      if (!input) continue;
      if (input.type === "checkbox") input.checked = Boolean(value);
      else input.value = value;
    }
  }

  document.getElementById("save-config").addEventListener("click", () => {
    saveJson(configStorageKey, { fields: serializeForm(), levels });
    status.textContent = "入力条件をこのブラウザに保存しました";
  });

  document.getElementById("load-config").addEventListener("click", () => {
    const saved = readJson(configStorageKey, null);
    if (!saved) { status.textContent = "保存済み条件はありません"; return; }
    restoreForm(saved.fields);
    levels = saved.levels || levels;
    itemButtons.forEach(button => {
      levels[button.dataset.item] = normalizeStage(levels[button.dataset.item] ?? 9);
      levelLabel(button).textContent = `+${levels[button.dataset.item]}`;
    });
    if (selectedButton) currentStage.value = String(levels[selectedButton.dataset.item]);
    status.textContent = "保存済み条件を読み込みました";
  });

  document.getElementById("new-calculation").addEventListener("click", () => {
    form.reset();
    applyDefaultPolicies();
    itemButtons.forEach(button => { levels[button.dataset.item] = 9; levelLabel(button).textContent = "+9"; });
    saveJson(storageKey, levels);
    document.getElementById("result-empty").hidden = false;
    document.getElementById("result-output").hidden = true;
    validationMessage.hidden = true;
    status.textContent = "新しい計算条件に戻しました";
  });
})().catch(error => {
  const status = document.getElementById("simulation-status");
  if (status) status.textContent = `初期化エラー: ${error.message}`;
});
