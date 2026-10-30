/* 拠点戦・税収管理ボード フロント処理 */
(function () {
  "use strict";

  const guildById = new Map((window.GUILDS || []).map(g => [g.id, g.name]));
  const body = document.body;
  const statusEl = document.getElementById("status");
  const canEdit = body.dataset.canedit === "1";
  let dirty = false;

  function toast(msg, isError) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.className = "toast show" + (isError ? " err" : "");
    setTimeout(() => { t.className = "toast" + (isError ? " err" : ""); }, 2800);
  }

  function markDirty() {
    if (!canEdit) return;
    dirty = true;
    statusEl.textContent = "未保存の変更があります";
    statusEl.classList.add("dirty");
  }

  window.addEventListener("beforeunload", e => {
    if (dirty) { e.preventDefault(); e.returnValue = ""; }
  });

  // ---------------------------------------------------- タブ
  document.querySelectorAll(".tabs .tab").forEach(t => {
    t.addEventListener("click", () => {
      document.querySelectorAll(".tabs .tab").forEach(x => x.classList.remove("active"));
      document.querySelectorAll(".pane").forEach(p => p.classList.remove("active"));
      t.classList.add("active");
      document.getElementById(t.dataset.pane).classList.add("active");
      window.scrollTo(0, 0);
    });
  });

  // ---------------------------------------------------- 行の状態
  function idsOf(row) {
    return (row.dataset.participants || "").split(",").filter(Boolean).map(Number);
  }

  function setIds(row, ids) {
    row.dataset.participants = ids.join(",");
    const btn = row.querySelector(".f-participants");
    if (ids.length) {
      btn.textContent = ids.map(i => guildById.get(i) || "?").join("、");
      btn.classList.remove("blank");
    } else {
      btn.textContent = "＋ 対戦ギルドを選ぶ";
      btn.classList.add("blank");
    }
    refreshWinner(row);
  }

  /** 勝ったギルドの選択肢を、対戦ギルド（無ければ入札権のあるギルド）から作る */
  function refreshWinner(row) {
    const sel = row.querySelector(".f-winner");
    const current = sel.value ? Number(sel.value) : null;
    let ids = idsOf(row);
    const fallback = !ids.length;
    if (fallback) ids = (row.dataset.eligible || "").split(",").filter(Boolean).map(Number);

    sel.innerHTML = "";
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = fallback ? "— 対戦ギルド未入力 —" : "— 未確定 —";
    sel.appendChild(blank);
    ids.forEach(id => {
      const o = document.createElement("option");
      o.value = id;
      o.textContent = guildById.get(id) || "?";
      sel.appendChild(o);
    });
    if (current && ids.includes(current)) sel.value = current;
    sel.classList.toggle("blank", !sel.value);
  }

  document.querySelectorAll(".brow").forEach(row => {
    refreshWinner(row);
    const saved = (window.WINNERS || {})[row.dataset.date + "_" + row.dataset.node];
    if (saved) {
      const sel = row.querySelector(".f-winner");
      sel.value = String(saved);
      sel.classList.remove("blank");
    }
    row.querySelectorAll("input,select").forEach(el => {
      el.addEventListener("change", () => {
        if (el.classList.contains("f-winner")) el.classList.toggle("blank", !el.value);
        markDirty();
      });
    });
  });

  // ---------------------------------------------------- 対戦ギルド選択モーダル
  const modal = document.getElementById("modal");
  const modalList = document.getElementById("modal-list");
  const modalSearch = document.getElementById("modal-search");
  let modalRow = null;

  function openModal(row) {
    modalRow = row;
    const isCastle = row.closest(".daysec").querySelector(".dayhead .cnt").textContent.indexOf("攻城") >= 0;
    document.getElementById("modal-title").textContent =
      isCastle ? "攻城1・攻城2 を選ぶ" : "対戦ギルドを選ぶ";
    const eligible = (row.dataset.eligible || "").split(",").filter(Boolean).map(Number);
    const chosen = new Set(idsOf(row));
    document.getElementById("modal-sub").textContent =
      row.querySelector(".node").textContent + " ／ 入札権のあるギルド " + eligible.length + "件";

    modalList.innerHTML = "";
    eligible.forEach(id => {
      const label = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = id;
      cb.checked = chosen.has(id);
      const span = document.createElement("span");
      span.textContent = guildById.get(id) || "?";
      label.appendChild(cb);
      label.appendChild(span);
      modalList.appendChild(label);
    });
    modalSearch.value = "";
    filterModal();
    modal.classList.add("open");
    modalSearch.focus();
  }

  function filterModal() {
    const q = modalSearch.value.trim().toLowerCase();
    modalList.querySelectorAll("label").forEach(l => {
      l.classList.toggle("hidden", !!q && l.textContent.toLowerCase().indexOf(q) < 0);
    });
  }

  if (modal) {
    modalSearch.addEventListener("input", filterModal);
    document.getElementById("modal-cancel").addEventListener("click", () => modal.classList.remove("open"));
    modal.addEventListener("click", e => { if (e.target === modal) modal.classList.remove("open"); });
    document.getElementById("modal-clear").addEventListener("click", () => {
      modalList.querySelectorAll("input").forEach(cb => { cb.checked = false; });
    });
    document.getElementById("modal-ok").addEventListener("click", () => {
      if (!modalRow) return;
      setIds(modalRow, [...modalList.querySelectorAll("input:checked")].map(cb => Number(cb.value)));
      modal.classList.remove("open");
      markDirty();
    });
  }

  document.querySelectorAll(".f-participants").forEach(btn => {
    if (btn.disabled) return;
    btn.addEventListener("click", () => openModal(btn.closest(".brow")));
  });

  // ---------------------------------------------------- 保存
  async function post(url, payload) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    let json;
    try { json = await res.json(); } catch (_) { json = { ok: false, error: "応答を読めませんでした" }; }
    if (!res.ok || !json.ok) throw new Error(json.error || "保存に失敗しました");
    return json;
  }

  const saveBtn = document.getElementById("btn-save");
  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      saveBtn.disabled = true;
      statusEl.textContent = "保存中…";
      try {
        const rows = [...document.querySelectorAll(".brow")].map(row => ({
          battle_date: row.dataset.date,
          node_id: Number(row.dataset.node),
          unified: row.querySelector(".f-unified").checked,
          banquet: row.querySelector(".f-banquet").checked,
          participants: idsOf(row),
          winner_guild_id: row.querySelector(".f-winner").value || null,
        }));
        await post("/api/week/save", { monday: body.dataset.monday, rows: rows });
        dirty = false;
        statusEl.classList.remove("dirty");
        statusEl.textContent = "保存しました";
        toast("保存しました");
        setTimeout(() => location.reload(), 600);
      } catch (err) {
        statusEl.textContent = "保存に失敗しました";
        toast(err.message, true);
        saveBtn.disabled = false;
      }
    });
  }

  // ---------------------------------------------------- ギルド管理
  document.querySelectorAll(".guild-save").forEach(btn => {
    btn.addEventListener("click", async () => {
      const row = btn.closest(".grow");
      try {
        await post("/api/guild", {
          id: row.dataset.id || null,
          name: row.querySelector(".f-name").value,
          note: row.querySelector(".f-note").value,
          active: row.querySelector(".f-active").checked,
        });
        toast("ギルドを保存しました");
        setTimeout(() => location.reload(), 500);
      } catch (err) { toast(err.message, true); }
    });
  });

  const guildAdd = document.getElementById("guild-add");
  if (guildAdd) {
    guildAdd.addEventListener("click", async () => {
      const name = prompt("追加するギルド名");
      if (!name) return;
      try {
        await post("/api/guild", { name: name, note: "", active: true });
        toast("ギルドを追加しました");
        setTimeout(() => location.reload(), 500);
      } catch (err) { toast(err.message, true); }
    });
  }

  // guild_master.csv の取り込み
  const importFile = document.getElementById("guild-import-file");
  const importText = document.getElementById("guild-import-text");
  const importBtn = document.getElementById("guild-import-btn");
  const importResult = document.getElementById("guild-import-result");
  if (importFile && importText) {
    importFile.addEventListener("change", async () => {
      const f = importFile.files[0];
      if (!f) return;
      importText.value = await f.text();
    });
  }
  if (importBtn) {
    importBtn.addEventListener("click", async () => {
      const csv = importText.value;
      if (!csv.trim()) { toast("CSVを貼り付けるかファイルを選んでください", true); return; }
      importBtn.disabled = true;
      try {
        const res = await post("/api/guild/import", { csv });
        importResult.textContent =
          `取り込み完了: 追加 ${res.added} 件 / 更新 ${res.updated} 件 / スキップ ${res.skipped} 件`;
        toast("ギルド一覧を取り込みました");
        setTimeout(() => location.reload(), 900);
      } catch (err) {
        importResult.textContent = "";
        toast(err.message, true);
      } finally {
        importBtn.disabled = false;
      }
    });
  }

  // ---------------------------------------------------- 拠点マスタ
  document.querySelectorAll(".node-save").forEach(btn => {
    btn.addEventListener("click", async () => {
      const row = btn.closest(".nrow");
      try {
        await post("/api/node", {
          id: row.dataset.id || null,
          weekday: row.querySelector(".f-weekday").value,
          slot: row.querySelector(".f-slot").value,
          name: row.querySelector(".f-name").value,
          tier: row.querySelector(".f-tier").value,
          time_code: row.querySelector(".f-time").value,
          fortress: row.querySelector(".f-fortress").checked,
          capacity: row.querySelector(".f-capacity").value,
          bid_slots: row.querySelector(".f-slots").value,
          effect: row.querySelector(".f-effect").value,
          effective_from: row.querySelector(".f-from").value,
          active: row.querySelector(".f-active").checked,
        });
        toast("拠点マスタを保存しました");
        setTimeout(() => location.reload(), 500);
      } catch (err) { toast(err.message, true); }
    });
  });

  // 初期保有（運用開始時の最初の1回だけ）の取り込み
  const initFile = document.getElementById("initial-import-file");
  const initText = document.getElementById("initial-import-text");
  const initBtn = document.getElementById("initial-import-btn");
  const initResult = document.getElementById("initial-import-result");
  if (initFile && initText) {
    initFile.addEventListener("change", async () => {
      const f = initFile.files[0];
      if (!f) return;
      initText.value = await f.text();
    });
  }
  if (initBtn) {
    initBtn.addEventListener("click", async () => {
      const csv = initText.value;
      if (!csv.trim()) { toast("CSVを貼り付けるかファイルを選んでください", true); return; }
      initBtn.disabled = true;
      try {
        const res = await post("/api/initial-holding/import", { csv });
        let msg = `取り込み完了: ${res.applied} 件登録 / ${res.skipped} 件スキップ`;
        if (res.errors && res.errors.length) msg += `\n見つからなかった名前:\n${res.errors.join("\n")}`;
        initResult.textContent = msg;
        toast("初期保有を取り込みました");
        setTimeout(() => location.reload(), 900);
      } catch (err) {
        initResult.textContent = "";
        toast(err.message, true);
      } finally {
        initBtn.disabled = false;
      }
    });
  }

  const nodeAdd = document.getElementById("node-add");
  if (nodeAdd) {
    nodeAdd.addEventListener("click", async () => {
      const name = prompt("追加する拠点名");
      if (!name) return;
      const weekday = prompt("開催曜日（mon / thu / fri / sat / sun）", "mon");
      if (!weekday) return;
      const tier = prompt("等級（3 / 2 / 1 / castle）", "1");
      if (!tier) return;
      const slot = prompt("枠（例 1A）", "1A") || "";
      try {
        await post("/api/node", {
          name: name, weekday: weekday, tier: tier, slot: slot,
          effective_from: body.dataset.today, active: true,
        });
        toast("拠点を追加しました");
        setTimeout(() => location.reload(), 500);
      } catch (err) { toast(err.message, true); }
    });
  }
})();
