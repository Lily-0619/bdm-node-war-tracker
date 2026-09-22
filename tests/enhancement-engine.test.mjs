import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runSimulation } from "../public/enhancement-engine.js";

const rules = JSON.parse(await readFile(new URL("../public/enhancement/rules.json", import.meta.url), "utf8"));
const common = {
  ruleVersion: rules.ruleVersion,
  quantity: 1,
  seed: 20260922,
  maxAttempts: 10000000,
  budget: 0,
  availableSeconds: 0,
};

const equipment = {
  ...common,
  system: "equipment",
  currentStage: 0,
  targetStage: 1,
  trials: 100,
  pity: {},
  inventory: { stone: 1000, tickets: 0, valksI: 0, akhramV: 0, valksV: null, akhramX: 0 },
  market: { stoneValuation: 0, ticketValuation: 528, boosterValuation: {} },
  policy: { restorationStages: [], boosterByStage: Array(10).fill("none"), consumeBoosterOnGuaranteed: false },
};

const firstStage = runSimulation(equipment, rules);
assert.equal(firstStage.completed, 100);
assert.equal(firstStage.metrics.normalAttempts.mean, 1);
assert.equal(firstStage.metrics.directCost.mean, 500);

const currentEquipmentSnapshot = runSimulation({
  ...equipment,
  currentStage: 9,
  targetStage: 10,
  trials: 20,
  pity: { 7: 11, 8: 0, 9: 13 },
  inventory: { stone: 370000, tickets: 4200000, valksI: 18600, akhramV: 68769, valksV: null, akhramX: 15577 },
  policy: {
    restorationStages: [7, 8, 9],
    boosterByStage: ["none", "none", "none", "none", "none", "valksI", "akhramV", "akhramX", "akhramX", "akhramX"],
    consumeBoosterOnGuaranteed: false,
  },
}, rules);
assert.equal(currentEquipmentSnapshot.validation.errors.length, 0);
assert.equal(currentEquipmentSnapshot.trials, 20);

const restorationRules = structuredClone(rules);
restorationRules.equipment.stages[1].successRate = 0;
restorationRules.equipment.stages[1].pityFailures = 1;
restorationRules.equipment.restoration.successRate = 1;
const restorationConfig = {
  ...equipment,
  currentStage: 1,
  targetStage: 2,
  trials: 1,
  inventory: { ...equipment.inventory, stone: 10, tickets: 1000 },
  policy: { ...equipment.policy, restorationStages: [1] },
};
const protectedFailure = runSimulation(restorationConfig, restorationRules);
assert.equal(protectedFailure.completed, 1);
assert.equal(protectedFailure.metrics.normalAttempts.mean, 2);
assert.equal(protectedFailure.metrics.ticketsUsed.mean, 200);

restorationRules.equipment.restoration.successRate = 0;
const droppedFailure = runSimulation(restorationConfig, restorationRules);
assert.equal(droppedFailure.completed, 1);
assert.equal(droppedFailure.metrics.normalAttempts.mean, 3);
assert.equal(droppedFailure.metrics.ticketsUsed.mean, 200);

const totem = {
  ...common,
  system: "totem",
  currentStage: 9,
  targetStage: 10,
  trials: 10000,
  pity: { 9: 14 },
  inventory: { material: 1000000, ogier: 10000000 },
  market: {
    material: { currentPrice: 425, valuationPrice: 425, buyLimitPrice: 450, purchasableQuantity: null, allowPurchase: false },
    ogier: { currentPrice: 12500000, valuationPrice: 12500000, buyLimitPrice: 13000000, purchasableQuantity: null, allowPurchase: false },
  },
  policy: { craftSeven: false, craftSeconds: null, useOgier: true },
};

const protectedTen = runSimulation(totem, rules);
assert.equal(protectedTen.completed, 10000);
assert.ok(Math.abs(protectedTen.metrics.normalAttempts.mean - 58.29) < 0.8);
assert.ok(Math.abs(protectedTen.metrics.ogierUsed.mean - 572.88) < 8);
assert.ok(Math.abs(protectedTen.exactCheck.expectedAttempts - 58.29) < 0.01);
assert.ok(Math.abs(protectedTen.exactCheck.expectedOgier - 572.88) < 0.1);

const reproducedA = runSimulation({ ...totem, trials: 250 }, rules);
const reproducedB = runSimulation({ ...totem, trials: 250 }, rules);
assert.deepEqual(reproducedA.histogram, reproducedB.histogram);
assert.deepEqual(reproducedA.metrics.normalAttempts, reproducedB.metrics.normalAttempts);

const guaranteed = runSimulation({ ...totem, trials: 100, pity: { 9: 100 } }, rules);
assert.equal(guaranteed.metrics.normalAttempts.mean, 1);
assert.equal(guaranteed.metrics.ogierUsed.mean, 0);

console.log("enhancement-engine tests passed");
