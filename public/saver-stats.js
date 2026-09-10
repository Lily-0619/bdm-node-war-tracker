(function () {
  "use strict";
  const colors = ["#217346", "#2878b5", "#d97706", "#a855f7", "#dc2626", "#0891b2", "#65a30d", "#db2777", "#4f46e5", "#b45309", "#0f766e", "#7c3aed", "#be123c", "#0369a1", "#3f6212"];
  const hiddenClasses = new Set();
  let loaded = null;
  const el = id => document.getElementById(id);
  const fmt = n => Number(n).toLocaleString("ja-JP");

  function bounds(series) {
    const values = series.flatMap(s => s.values.map(v => v.value)).filter(Number.isFinite);
    const min = Math.min(...values, 0), max = Math.max(...values, 1);
    return { min, max, span: Math.max(1, max - min) };
  }
  function lineChart(target, dates, series) {
    const host = el(target); host.innerHTML = "";
    if (!dates.length || !series.length) { host.textContent = "この期間のデータはありません。"; return; }
    const width = Math.max(760, host.clientWidth || 760), height = target === "class-chart" ? 440 : 340;
    const pad = { l: 70, r: 24, t: 24, b: 55 }, plotW = width - pad.l - pad.r, plotH = height - pad.t - pad.b;
    const b = bounds(series); const x = i => pad.l + (dates.length === 1 ? plotW / 2 : i * plotW / (dates.length - 1));
    const y = v => pad.t + plotH - (v - b.min) / b.span * plotH;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    for (let i = 0; i <= 4; i++) { const yy = pad.t + plotH * i / 4; const val = Math.round(b.max - b.span * i / 4); svg.insertAdjacentHTML("beforeend", `<line x1="${pad.l}" y1="${yy}" x2="${width-pad.r}" y2="${yy}" class="grid"/><text x="${pad.l-10}" y="${yy+4}" text-anchor="end">${fmt(val)}</text>`); }
    dates.forEach((d, i) => { if (dates.length <= 12 || i % Math.ceil(dates.length / 10) === 0 || i === dates.length - 1) svg.insertAdjacentHTML("beforeend", `<text x="${x(i)}" y="${height-20}" text-anchor="middle">${d.slice(5)}</text>`); });
    series.forEach(s => { const points = s.values.map((v, i) => `${x(i)},${y(v.value)}`).join(" "); svg.insertAdjacentHTML("beforeend", `<polyline points="${points}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round"><title>${s.name}</title></polyline>`); });
    host.appendChild(svg);
  }
  function legend(target, series, interactive) {
    const host = el(target); host.innerHTML = "";
    series.forEach(s => { const b = document.createElement(interactive ? "button" : "span"); b.className = "legend-item" + (hiddenClasses.has(s.name) ? " off" : ""); b.innerHTML = `<i style="background:${s.color}"></i>${s.name}`; if (interactive) b.onclick = () => { hiddenClasses.has(s.name) ? hiddenClasses.delete(s.name) : hiddenClasses.add(s.name); render(); }; host.appendChild(b); });
  }
  function render() {
    const server = el("stats-server").value;
    const snaps = loaded.snapshots.filter(s => s.server === server);
    const dates = snaps.map(s => s.captured_date), latest = snaps[snaps.length - 1];
    el("stats-latest").innerHTML = latest ? [["TOTAL PLAYERS",latest.total_players],["ACTIVE PLAYERS (1 MONTH)",latest.active_players],["TOTAL GUILDS",latest.total_guilds],["ACTIVE GUILDS (1 MONTH)",latest.active_guilds]].map(x => `<article><span>${x[0]}</span><strong>${fmt(x[1])}</strong><small>${latest.captured_date}</small></article>`).join("") : "";
    const metrics = [{name:"Total Players",key:"total_players",color:colors[0]},{name:"Active Players",key:"active_players",color:colors[1]},{name:"Total Guilds",key:"total_guilds",color:colors[2]},{name:"Active Guilds",key:"active_guilds",color:colors[3]}].map(m => ({...m,values:snaps.map(s => ({value:s[m.key]}))}));
    legend("metric-legend", metrics, false); lineChart("metric-chart", dates, metrics);
    const classesBySnap = new Map(); loaded.classes.forEach(c => { if (!classesBySnap.has(c.snapshot_id)) classesBySnap.set(c.snapshot_id, new Map()); classesBySnap.get(c.snapshot_id).set(c.class_name,c.player_count); });
    const names = [...new Set(snaps.flatMap(s => [...(classesBySnap.get(s.id)||new Map()).keys()]))].sort();
    const allClassSeries = names.map((name,i) => ({name,color:colors[i%colors.length],values:snaps.map(s => ({value:(classesBySnap.get(s.id)||new Map()).get(name) || 0}))}));
    legend("class-legend", allClassSeries, true); lineChart("class-chart", dates, allClassSeries.filter(s => !hiddenClasses.has(s.name)));
  }
  async function load() {
    const q = new URLSearchParams(); if (el("stats-from").value) q.set("from",el("stats-from").value); if (el("stats-to").value) q.set("to",el("stats-to").value);
    const res = await fetch("/api/saver-stats?" + q); const data = await res.json(); if (!res.ok) throw new Error(data.error || "取得に失敗しました"); loaded = data; render();
  }
  el("stats-apply").onclick = () => load().catch(showError); el("stats-server").onchange = () => loaded && render();
  function showError(e) { el("stats-error").hidden = false; el("stats-error").textContent = e.message; }
  load().catch(showError);
})();

