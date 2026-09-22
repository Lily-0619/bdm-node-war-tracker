(function () {
  "use strict";
  const dialog = document.getElementById("enhancement-dialog");
  const title = document.getElementById("dialog-title");
  const type = document.getElementById("dialog-type");
  const currentStage = document.getElementById("current-stage");
  const resetButton = document.getElementById("reset-levels");
  const storageKey = "bdm-enhancement-levels-v1";
  const itemButtons = [...document.querySelectorAll("[data-item]:not([disabled])")];
  let selectedButton = null;
  let levels = {};

  try {
    levels = JSON.parse(localStorage.getItem(storageKey) || "{}") || {};
  } catch (_) {
    levels = {};
  }

  const normalizeStage = value => Math.max(0, Math.min(10, Number.parseInt(value, 10) || 0));
  const levelLabel = button => button.querySelector(".sim-level, .totem-level");
  const saveLevels = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(levels));
    } catch (_) {
      // Storage may be disabled; the page still works for the current session.
    }
  };

  itemButtons.forEach(button => {
    const key = button.dataset.item;
    levels[key] = normalizeStage(levels[key] ?? 9);
    const label = levelLabel(button);
    if (label) label.textContent = `+${levels[key]}`;
  });
  saveLevels();

  itemButtons.forEach(button => {
    button.addEventListener("click", () => {
      selectedButton = button;
      title.textContent = button.dataset.name;
      type.textContent = button.dataset.item === "totem" ? "TOTEM" : "EQUIPMENT";
      currentStage.value = String(levels[button.dataset.item]);
      document.querySelectorAll(".dialog-tabs button").forEach((item, index) => item.classList.toggle("active", index === 0));
      document.querySelectorAll(".dialog-pane").forEach(pane => pane.classList.toggle("active", pane.dataset.pane === "state"));
      dialog.showModal();
    });
  });

  currentStage.addEventListener("input", () => {
    if (!selectedButton || currentStage.value === "") return;
    const value = normalizeStage(currentStage.value);
    currentStage.value = String(value);
    levels[selectedButton.dataset.item] = value;
    const label = levelLabel(selectedButton);
    if (label) label.textContent = `+${value}`;
    saveLevels();
  });

  resetButton.addEventListener("click", () => {
    itemButtons.forEach(button => {
      levels[button.dataset.item] = 9;
      const label = levelLabel(button);
      if (label) label.textContent = "+9";
    });
    saveLevels();
    if (selectedButton) currentStage.value = "9";
  });

  document.querySelectorAll(".dialog-tabs button").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".dialog-tabs button").forEach(item => item.classList.toggle("active", item === button));
      document.querySelectorAll(".dialog-pane").forEach(pane => pane.classList.toggle("active", pane.dataset.pane === button.dataset.tab));
    });
  });

  document.querySelectorAll(".system-switch button").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".system-switch button").forEach(item => item.classList.toggle("active", item === button));
      if (button.dataset.system === "totem") document.querySelector(".totem-slot").focus();
    });
  });
})();
