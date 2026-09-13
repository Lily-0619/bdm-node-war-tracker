(function () {
  "use strict";
  const byId = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[c]);
  let polling = null;

  function render(data) {
    const run = data.run;
    byId("karte-status").innerHTML = run
      ? `<strong>${esc(run.phase)}</strong>　${run.completed_guilds}/${run.total_guilds}件` +
        (run.failed_guilds ? `　失敗 ${run.failed_guilds}件` : "") +
        (run.current_guild ? `<br><small>${esc(run.current_guild)}</small>` : "")
      : "まだ実行されていません。";
    byId("karte-run").disabled = !!run && ["queued","collecting","analyzing"].includes(run.status);
    byId("karte-guilds").innerHTML = data.guilds.map(g => `<span class="karte-chip">${esc(g.name)}</span>`).join("");
    byId("karte-analysis").innerHTML = data.analyses.length ? `<table><thead><tr><th>ギルド</th><th>日付</th><th>人数</th><th>平均CP</th><th>前回比</th><th>合計CP</th><th>前回比</th><th>合計FCP</th></tr></thead><tbody>${data.analyses.map(row => `<tr><td>${esc(row.name)}</td><td>${esc(row.retrieved_date)}</td><td>${esc(row.member_count)}</td><td>${Number(row.avg_cp || 0).toLocaleString()}</td><td>${row.avg_cp_change == null ? "-" : Number(row.avg_cp_change).toLocaleString()}</td><td>${Number(row.total_cp || 0).toLocaleString()}</td><td>${row.total_cp_change == null ? "-" : Number(row.total_cp_change).toLocaleString()}</td><td>${Number(row.total_fcp || 0).toLocaleString()}</td></tr>`).join("")}</tbody></table>` : "解析データはまだありません。";
    byId("karte-tracked").innerHTML = data.tracked.length
      ? data.tracked.map(p => `<span class="karte-chip">${esc(p.current_family_name)}</span>`).join("")
      : "追跡対象者はまだ登録されていません。";
    byId("karte-reviews").innerHTML = data.reviews.length ? `<table><thead><tr><th>種類</th><th>以前</th><th>現在候補</th><th>判断</th></tr></thead><tbody>${data.reviews.map(r =>
      `<tr><td>${esc(r.kind)}</td><td>${esc(r.old_family_name)}<br><small>${esc(r.old_guild_name)}</small></td><td>${esc(r.new_family_name)}<br><small>${esc(r.new_guild_name)}</small></td><td><button class="btn karte-review" data-id="${r.id}" data-decision="same_person" ${r.new_family_name ? "" : "disabled"}>同一人物</button><button class="btn karte-review" data-id="${r.id}" data-decision="different_person">別人</button><button class="btn karte-review" data-id="${r.id}" data-decision="hold">保留</button></td></tr>`
    ).join("")}</tbody></table>` : "確認待ちはありません。";
    document.querySelectorAll(".karte-review").forEach(button => button.onclick = async () => {
      await fetch(`/api/guild-karte/reviews/${button.dataset.id}`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ decision: button.dataset.decision }) });
      await load();
    });
    if (run && ["queued","collecting","analyzing"].includes(run.status) && !polling) polling = setInterval(load, 5000);
    if ((!run || !["queued","collecting","analyzing"].includes(run.status)) && polling) { clearInterval(polling); polling = null; }
  }

  async function load() {
    const response = await fetch("/api/guild-karte", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "読込に失敗しました");
    render(data);
  }

  function error(err) { byId("karte-error").hidden = false; byId("karte-error").textContent = err.message; }
  byId("karte-run").onclick = async () => {
    byId("karte-run").disabled = true;
    try {
      const response = await fetch("/api/guild-karte/run", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "起動できませんでした");
      await load();
    } catch (err) { error(err); byId("karte-run").disabled = false; }
  };
  async function searchPeople() {
    const response = await fetch("/api/guild-karte/people?q=" + encodeURIComponent(byId("karte-person-query").value));
    const data = await response.json();
    byId("karte-people").innerHTML = data.people.map(person => `<label class="karte-person"><input type="checkbox" data-person-id="${person.id}" ${person.tracking_enabled ? "checked" : ""}>${esc(person.current_family_name)}</label>`).join("") || "該当者はいません。";
    byId("karte-people").querySelectorAll("input").forEach(input => input.onchange = async () => {
      await fetch(`/api/guild-karte/tracking/${input.dataset.personId}`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ enabled: input.checked }) });
      await load();
    });
  }
  byId("karte-person-search").onclick = () => searchPeople().catch(error);
  byId("karte-person-query").onkeydown = event => { if (event.key === "Enter") searchPeople().catch(error); };
  load().catch(error);
})();
