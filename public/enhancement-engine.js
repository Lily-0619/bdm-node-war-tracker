const mean = values => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);

function percentile(sorted, ratio) {
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function summarize(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const average = mean(sorted);
  const variance = sorted.length > 1
    ? sorted.reduce((sum, value) => sum + (value - average) ** 2, 0) / (sorted.length - 1)
    : 0;
  const standardDeviation = Math.sqrt(variance);
  const standardError = standardDeviation / Math.sqrt(sorted.length);
  return {
    count: sorted.length,
    mean: average,
    median: percentile(sorted, 0.5),
    standardDeviation,
    min: sorted[0],
    max: sorted.at(-1),
    p75: percentile(sorted, 0.75),
    p90: percentile(sorted, 0.9),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    confidence95: [average - 1.96 * standardError, average + 1.96 * standardError],
  };
}

function histogram(values, binCount = 18) {
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [{ from: min, to: max, count: values.length }];
  const width = (max - min) / binCount;
  const bins = Array.from({ length: binCount }, (_, index) => ({
    from: min + width * index,
    to: min + width * (index + 1),
    count: 0,
  }));
  for (const value of values) bins[Math.min(binCount - 1, Math.floor((value - min) / width))].count += 1;
  return bins;
}

function seededRandom(seed) {
  let value = (Number(seed) || 1) >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

const finite = value => Number.isFinite(Number(value));
const nonNegative = value => finite(value) && Number(value) >= 0;

export function validateConfig(config, rules) {
  const errors = [];
  const warnings = [];
  if (!rules || config.ruleVersion !== rules.ruleVersion) errors.push("ルールバージョンが一致しません。");
  if (!Number.isInteger(config.currentStage) || !Number.isInteger(config.targetStage)) errors.push("段階は整数で入力してください。");
  if (config.currentStage < 0 || config.targetStage > 10 || config.currentStage >= config.targetStage) errors.push("現在段階は目標段階より小さい0～9で入力してください。");
  if (!Number.isInteger(config.trials) || config.trials < 1 || config.trials > 10000) errors.push("試行回数は1～10,000回で入力してください。");
  if (!Number.isInteger(config.quantity) || config.quantity < 1 || config.quantity > 20) errors.push("作成個数は1～20個で入力してください。");
  if (!Number.isInteger(config.seed)) errors.push("乱数シードは整数で入力してください。");
  if (!nonNegative(config.maxAttempts) || Number(config.maxAttempts) < 1) errors.push("1試行の最大強化回数を入力してください。");

  const stageRules = rules?.[config.system]?.stages || [];
  for (const stageRule of stageRules) {
    const pity = config.pity?.[stageRule.fromStage] ?? 0;
    if (!nonNegative(pity)) errors.push(`+${stageRule.fromStage}→+${stageRule.toStage}の天井進捗が不正です。`);
    if (stageRule.pityFailures !== null && pity > stageRule.pityFailures) {
      errors.push(`+${stageRule.fromStage}→+${stageRule.toStage}の天井進捗が上限を超えています。`);
    }
  }

  if (config.system === "equipment") {
    for (const key of ["stone", "tickets", "valksI", "akhramV", "akhramX"]) {
      if (!nonNegative(config.inventory?.[key])) errors.push(`${key}の所持数を0以上で入力してください。`);
    }
    const selectedBoosters = new Set(config.policy?.boosterByStage || []);
    if (selectedBoosters.has("valksV") && !nonNegative(config.inventory?.valksV)) errors.push("ヴォルクスVを使う場合は所持数を入力してください。");
    if (config.policy?.boosterByStage?.some?.(value => value === "valksV")) {
      warnings.push("ヴォルクスVの解放条件は未確認です。入力した方針を仮定して計算します。");
    }
    warnings.push("装備+1→+2の天井は暫定値です。");
    warnings.push(`天井確定挑戦の補助アイテム消費は「${config.policy?.consumeBoosterOnGuaranteed ? "消費する" : "消費しない"}」設定です。`);
  } else if (config.system === "totem") {
    if (!nonNegative(config.inventory?.material)) errors.push("凸素材の所持数を入力してください。");
    if (config.policy?.useOgier && !nonNegative(config.inventory?.ogier)) errors.push("オギエールを使用する場合は所持数を入力してください。");
    if (config.currentStage < 2) warnings.push("トーテム+0→+1、+1→+2の天井は未提示のため、天井なしで計算します。");
    if (config.policy?.craftSeven && !nonNegative(config.policy?.craftSeconds)) errors.push("+7確定作製の手作業時間を入力してください。");
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

function baseMetrics() {
  return {
    completed: false,
    reason: "max_attempts",
    normalAttempts: 0,
    successes: 0,
    failures: 0,
    materialsUsed: 0,
    restorationChecks: 0,
    restorationSuccesses: 0,
    restorationFailures: 0,
    ticketsUsed: 0,
    boostersUsed: { valksI: 0, akhramV: 0, valksV: 0, akhramX: 0 },
    ogierUsed: 0,
    crafts: 0,
    directCost: 0,
    resourceValue: 0,
    totalCost: 0,
    machineSeconds: 0,
    manualSeconds: 0,
    finalStage: 0,
  };
}

function stopReason(metrics, config) {
  metrics.totalCost = metrics.directCost + metrics.resourceValue;
  if (config.budget > 0 && metrics.totalCost > config.budget) return "budget";
  if (config.availableSeconds > 0 && metrics.machineSeconds + metrics.manualSeconds > config.availableSeconds) return "deadline";
  if (metrics.normalAttempts >= config.maxAttempts) return "max_attempts";
  return null;
}

function simulateEquipment(config, rules, random) {
  const metrics = baseMetrics();
  const inventory = { ...config.inventory };
  const stageRules = rules.equipment.stages;
  const restoration = rules.equipment.restoration;

  for (let item = 0; item < config.quantity; item += 1) {
    let stage = config.currentStage;
    const pity = { ...config.pity };
    while (stage < config.targetStage) {
      if (inventory.stone < 1) { metrics.reason = "inventory"; metrics.finalStage = stage; return metrics; }
      const stageRule = stageRules[stage];
      inventory.stone -= 1;
      metrics.materialsUsed += 1;
      metrics.normalAttempts += 1;
      metrics.directCost += rules.equipment.attemptSilver;
      metrics.resourceValue += Number(config.market.stoneValuation || 0);
      metrics.machineSeconds += rules.equipment.attemptSeconds;

      const guaranteed = stageRule.pityFailures !== null && Number(pity[stage] || 0) >= stageRule.pityFailures;
      const boosterKey = config.policy.boosterByStage?.[stage] || "none";
      const boosterRule = rules.equipment.boosters[boosterKey];
      let multiplier = 1;
      if (boosterRule && (!guaranteed || config.policy.consumeBoosterOnGuaranteed) && inventory[boosterKey] > 0) {
        inventory[boosterKey] -= 1;
        metrics.boostersUsed[boosterKey] += 1;
        metrics.resourceValue += Number(config.market.boosterValuation?.[boosterKey] || 0);
        multiplier = boosterRule.multiplier;
      }

      const succeeded = guaranteed || random() < Math.min(1, stageRule.successRate * multiplier);
      if (succeeded) {
        metrics.successes += 1;
        pity[stage] = 0;
        stage += 1;
      } else {
        metrics.failures += 1;
        pity[stage] = Number(pity[stage] || 0) + 1;
        if (config.policy.restorationStages.includes(stage)) {
          if (inventory.tickets < restoration.ticketsPerAttempt) { metrics.reason = "inventory"; metrics.finalStage = stage; return metrics; }
          inventory.tickets -= restoration.ticketsPerAttempt;
          metrics.ticketsUsed += restoration.ticketsPerAttempt;
          metrics.restorationChecks += 1;
          metrics.resourceValue += restoration.ticketsPerAttempt * Number(config.market.ticketValuation || 0);
          metrics.machineSeconds += restoration.seconds;
          if (random() < restoration.successRate) metrics.restorationSuccesses += 1;
          else { metrics.restorationFailures += 1; stage = Math.max(0, stage - 1); }
        } else stage = Math.max(0, stage - 1);
      }
      const stopped = stopReason(metrics, config);
      if (stopped) { metrics.reason = stopped; metrics.finalStage = stage; return metrics; }
    }
  }
  metrics.completed = true;
  metrics.reason = "completed";
  metrics.finalStage = config.targetStage;
  metrics.totalCost = metrics.directCost + metrics.resourceValue;
  return metrics;
}

function simulateTotem(config, rules, random) {
  const metrics = baseMetrics();
  const inventory = { ...config.inventory };
  const purchased = { material: 0, ogier: 0 };
  const stageRules = rules.totem.stages;

  const canTake = (key, count, market) => {
    const owned = Number(inventory[key] || 0);
    const allowedByPrice = market.allowPurchase && Number(market.currentPrice) <= Number(market.buyLimitPrice);
    const purchaseLimit = market.purchasableQuantity === null ? Infinity : Number(market.purchasableQuantity || 0);
    const canPurchase = Math.max(0, purchaseLimit - purchased[key]);
    return owned + (allowedByPrice ? canPurchase : 0) >= count;
  };

  const take = (key, count, market) => {
    const owned = Number(inventory[key] || 0);
    const allowedByPrice = market.allowPurchase && Number(market.currentPrice) <= Number(market.buyLimitPrice);
    const purchaseLimit = market.purchasableQuantity === null ? Infinity : Number(market.purchasableQuantity || 0);
    const canPurchase = Math.max(0, purchaseLimit - purchased[key]);
    if (!canTake(key, count, market)) return false;
    const fromOwned = Math.min(owned, count);
    const toBuy = count - fromOwned;
    inventory[key] = owned - fromOwned;
    purchased[key] += toBuy;
    metrics.directCost += toBuy * Number(market.currentPrice || 0);
    metrics.resourceValue += count * Number(market.valuationPrice || 0);
    return true;
  };

  for (let item = 0; item < config.quantity; item += 1) {
    let stage = config.currentStage;
    const pity = { ...config.pity };
    while (stage < config.targetStage) {
      if (stage === 6 && config.policy.craftSeven) {
        if (!take("material", rules.totem.guaranteedSeven.materials, config.market.material)) { metrics.reason = "inventory"; metrics.finalStage = stage; return metrics; }
        metrics.materialsUsed += rules.totem.guaranteedSeven.materials;
        metrics.crafts += 1;
        metrics.manualSeconds += Number(config.policy.craftSeconds || 0);
        stage = 7;
      } else {
        if (stage === 9 && config.policy.useOgier && !canTake("ogier", rules.totem.ogier.perFailure, config.market.ogier)) { metrics.reason = "inventory"; metrics.finalStage = stage; return metrics; }
        if (!take("material", 1, config.market.material)) { metrics.reason = "inventory"; metrics.finalStage = stage; return metrics; }
        metrics.materialsUsed += 1;
        metrics.normalAttempts += 1;
        metrics.machineSeconds += rules.totem.attemptSeconds;
        const stageRule = stageRules[stage];
        const guaranteed = stageRule.pityFailures !== null && Number(pity[stage] || 0) >= stageRule.pityFailures;
        if (guaranteed || random() < stageRule.successRate) {
          metrics.successes += 1;
          pity[stage] = 0;
          stage += 1;
        } else {
          metrics.failures += 1;
          pity[stage] = Number(pity[stage] || 0) + 1;
          if (stage === rules.totem.ogier.fromStage && config.policy.useOgier) {
            if (!take("ogier", rules.totem.ogier.perFailure, config.market.ogier)) { metrics.reason = "inventory"; metrics.finalStage = stage; return metrics; }
            metrics.ogierUsed += rules.totem.ogier.perFailure;
          } else stage = Math.max(0, stage - 1);
        }
      }
      const stopped = stopReason(metrics, config);
      if (stopped) { metrics.reason = stopped; metrics.finalStage = stage; return metrics; }
    }
  }
  metrics.completed = true;
  metrics.reason = "completed";
  metrics.finalStage = config.targetStage;
  metrics.totalCost = metrics.directCost + metrics.resourceValue;
  return metrics;
}

export function runSimulation(config, rules) {
  const validation = validateConfig(config, rules);
  if (validation.errors.length) return { validation, config, ruleVersion: rules.ruleVersion };
  const random = seededRandom(config.seed);
  const trials = [];
  for (let index = 0; index < config.trials; index += 1) {
    trials.push(config.system === "equipment"
      ? simulateEquipment(config, rules, random)
      : simulateTotem(config, rules, random));
  }
  const completed = trials.filter(trial => trial.completed);
  const keys = ["normalAttempts", "materialsUsed", "ticketsUsed", "ogierUsed", "directCost", "resourceValue", "totalCost", "machineSeconds", "manualSeconds"];
  const metrics = Object.fromEntries(keys.map(key => [key, summarize(completed.map(trial => trial[key]))]));
  metrics.restorationChecks = summarize(completed.map(trial => trial.restorationChecks));
  for (const key of ["valksI", "akhramV", "valksV", "akhramX"]) {
    metrics[`${key}Used`] = summarize(completed.map(trial => trial.boostersUsed[key]));
  }
  const primaryKey = config.system === "equipment" ? "normalAttempts" : "materialsUsed";
  const terminationCounts = {};
  for (const trial of trials) terminationCounts[trial.reason] = (terminationCounts[trial.reason] || 0) + 1;
  let exactCheck = null;
  if (config.system === "totem" && config.currentStage === 9 && config.targetStage === 10 && config.quantity === 1 && config.policy.useOgier) {
    const stageRule = rules.totem.stages[9];
    const remainingFailures = Math.max(0, stageRule.pityFailures - Number(config.pity[9] || 0));
    const expectedAttempts = (1 - (1 - stageRule.successRate) ** (remainingFailures + 1)) / stageRule.successRate;
    exactCheck = {
      method: "truncated_geometric",
      expectedAttempts,
      expectedFailures: expectedAttempts - 1,
      expectedOgier: (expectedAttempts - 1) * rules.totem.ogier.perFailure,
      maximumAttempts: remainingFailures + 1,
    };
  }
  return {
    validation,
    ruleVersion: rules.ruleVersion,
    seed: config.seed,
    trials: config.trials,
    completed: completed.length,
    completionRate: completed.length / config.trials,
    inventoryFailureRate: trials.filter(trial => trial.reason === "inventory").length / config.trials,
    budgetFailureRate: trials.filter(trial => trial.reason === "budget").length / config.trials,
    deadlineFailureRate: trials.filter(trial => trial.reason === "deadline").length / config.trials,
    terminationCounts,
    primaryKey,
    histogram: histogram(completed.map(trial => trial[primaryKey])),
    metrics,
    exactCheck,
  };
}
