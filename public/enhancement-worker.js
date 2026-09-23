import { runSimulation } from "./enhancement-engine.js";

self.onmessage = event => {
  try {
    const { config, rules } = event.data;
    self.postMessage({ ok: true, result: runSimulation(config, rules) });
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
