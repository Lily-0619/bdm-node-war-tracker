(function () {
  "use strict";
  const dialog = document.getElementById("enhancement-dialog");
  const title = document.getElementById("dialog-title");
  const type = document.getElementById("dialog-type");

  document.querySelectorAll("[data-item]:not([disabled])").forEach(button => {
    button.addEventListener("click", () => {
      title.textContent = button.dataset.name;
      type.textContent = button.dataset.item === "totem" ? "TOTEM" : "EQUIPMENT";
      document.querySelectorAll(".dialog-tabs button").forEach((item, index) => item.classList.toggle("active", index === 0));
      document.querySelectorAll(".dialog-pane").forEach(pane => pane.classList.toggle("active", pane.dataset.pane === "state"));
      dialog.showModal();
    });
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
