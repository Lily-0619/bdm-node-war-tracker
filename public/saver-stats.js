(function () {
  "use strict";

  const classDefs = [
    ["WR", "Warrior"], ["RG", "Ranger"], ["WT", "Witch"], ["GA", "Giant"],
    ["VK", "Valkyrie"], ["SR", "Sorceress"], ["BD", "Musa"], ["TB", "Tamer"],
    ["NJ", "Ninja"], ["DK", "Dark Knight"], ["KT", "Striker"], ["LS", "Maehwa"],
    ["LN", "Lahn"], ["MT", "Mystic"], ["WZ", "Wizard"], ["SH", "Shai"],
    ["KN", "Kunoichi"], ["AC", "Archer"], ["HS", "Hashashin"], ["NV", "Nova"],
    ["GD", "Guardian"], ["CO", "Corsair"], ["SG", "Sage"], ["DR", "Drakania"],
    ["MG", "Maegu"], ["WS", "Woosa"], ["SC", "Scholar"], ["DS", "Dosa"],
    ["DE", "Deadeye"], ["SP", "Seraph"],
  ].map(([code, name]) => ({ code, name, icon: `/class-button/${code}.svg` }));
  const aliases = { Askeia: "Mystic", Zayed: "Hashashin", Sura: "Ninja" };
  const colors = ["#2878b5", "#a855f7"];
  let loaded = null;

  const el = id => document.getElementById(id);
  const fmt = n => Number(n).toLocaleString("ja-JP");
  const svgEl = (name, attrs = {}) => {
    const node = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
    return node;
  };

  function lineChart(host, dates, values, title, color) {
    const panel = document.createElement("section");
    panel.className = "metric-panel";
    const heading = document.createElement("h3");
    heading.textContent = title;
    panel.appendChild(heading);
    if (!dates.length) {
      panel.insertAdjacentHTML("beforeend", "<p>この期間のデータはありません。</p>");
      host.appendChild(panel);
      return;
    }
    const width = 560, height = 260, pad = { l: 64, r: 18, t: 18, b: 42 };
    const plotW = width - pad.l - pad.r, plotH = height - pad.t - pad.b;
    const max = Math.max(...values, 1), min = Math.min(...values, 0), span = Math.max(1, max - min);
    const x = i => pad.l + (dates.length === 1 ? plotW / 2 : i * plotW / (dates.length - 1));
    const y = value => pad.t + plotH - (value - min) / span * plotH;
    const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": `${title}の推移` });
    svg.appendChild(svgEl("title")).textContent = `${title}の推移`;
    for (let i = 0; i <= 4; i++) {
      const yy = pad.t + plotH * i / 4;
      svg.appendChild(svgEl("line", { x1: pad.l, y1: yy, x2: width - pad.r, y2: yy, class: "grid" }));
      const label = svgEl("text", { x: pad.l - 8, y: yy + 4, "text-anchor": "end" });
      label.textContent = fmt(Math.round(max - span * i / 4)); svg.appendChild(label);
    }
    dates.forEach((date, i) => {
      if (dates.length <= 10 || i % Math.ceil(dates.length / 8) === 0 || i === dates.length - 1) {
        const label = svgEl("text", { x: x(i), y: height - 15, "text-anchor": "middle" });
        label.textContent = date.slice(5); svg.appendChild(label);
      }
    });
    const points = values.map((value, i) => `${x(i)},${y(value)}`).join(" ");
    svg.appendChild(svgEl("polyline", { points, fill: "none", stroke: color, "stroke-width": 3, "stroke-linejoin": "round" }));
    values.forEach((value, i) => {
      const dot = svgEl("circle", { cx: x(i), cy: y(value), r: 4, fill: color });
      dot.appendChild(svgEl("title")).textContent = `${dates[i]}: ${fmt(value)}`;
      svg.appendChild(dot);
    });
    panel.appendChild(svg); host.appendChild(panel);
  }

  function classTimeline(def, snapshots, classesBySnap) {
    const panel = document.createElement("section");
    panel.className = "class-timeline";
    panel.innerHTML = `<h3><img src="${def.icon}" alt="">${def.name}<small>${def.code}</small></h3>`;
    const rows = [...snapshots].reverse().map(snapshot => ({
      date: snapshot.captured_date,
      value: classesBySnap.get(snapshot.id)?.get(def.name) || 0,
    }));
    if (!rows.length) {
      panel.insertAdjacentHTML("beforeend", "<p>この期間のデータはありません。</p>");
      return panel;
    }
    const width = 480, rowH = 38, top = 10, bottom = 10, labelW = 68, valueW = 48;
    const plotW = width - labelW - valueW, height = top + bottom + rows.length * rowH;
    const max = Math.max(...rows.map(row => row.value), 1);
    const barX = labelW, barH = 26;
    const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": `${def.name}のTop1000人数推移` });
    svg.appendChild(svgEl("title")).textContent = `${def.name}のTop1000人数推移（新しい日付が上）`;
    const endpoints = [];
    rows.forEach((row, index) => {
      const y = top + index * rowH + (rowH - barH) / 2;
      const barW = row.value ? Math.max(2, row.value / max * plotW) : 0;
      const date = svgEl("text", { x: labelW - 7, y: y + barH / 2 + 4, "text-anchor": "end", class: "class-date" });
      date.textContent = row.date.slice(5); svg.appendChild(date);
      svg.appendChild(svgEl("rect", { x: barX, y, width: plotW, height: barH, class: "class-track" }));
      const bar = svgEl("rect", { x: barX, y, width: barW, height: barH, class: "class-bar" });
      bar.appendChild(svgEl("title")).textContent = `${row.date}: ${fmt(row.value)}人`;
      svg.appendChild(bar);
      if (barW >= 24) {
        svg.appendChild(svgEl("image", { href: def.icon, x: barX + Math.max(2, (barW - 22) / 2), y: y + 2, width: 22, height: 22, class: "class-icon" }));
      }
      const value = svgEl("text", { x: Math.min(width - 3, barX + barW + 6), y: y + barH / 2 + 4, class: "class-value" });
      value.textContent = fmt(row.value); svg.appendChild(value);
      endpoints.push(`${barX + barW},${y + barH / 2}`);
    });
    if (endpoints.length > 1) {
      svg.appendChild(svgEl("polyline", { points: endpoints.join(" "), class: "class-trend", fill: "none" }));
    }
    panel.appendChild(svg);
    return panel;
  }

  function render() {
    const server = el("stats-server").value;
    const snapshots = loaded.snapshots.filter(snapshot => snapshot.server === server);
    const dates = snapshots.map(snapshot => snapshot.captured_date);
    const latest = snapshots[snapshots.length - 1];
    el("stats-latest").innerHTML = latest ? [
      ["TOTAL PLAYERS", latest.total_players], ["ACTIVE PLAYERS (1 MONTH)", latest.active_players],
      ["TOTAL GUILDS", latest.total_guilds], ["ACTIVE GUILDS (1 MONTH)", latest.active_guilds],
    ].map(item => `<article><span>${item[0]}</span><strong>${fmt(item[1])}</strong><small>${latest.captured_date}</small></article>`).join("") : "";

    const classesBySnap = new Map();
    loaded.classes.forEach(item => {
      if (!classesBySnap.has(item.snapshot_id)) classesBySnap.set(item.snapshot_id, new Map());
      const name = aliases[item.class_name] || item.class_name;
      const values = classesBySnap.get(item.snapshot_id);
      values.set(name, (values.get(name) || 0) + item.player_count);
    });
    const classHost = el("class-chart"); classHost.innerHTML = "";
    classDefs.forEach(def => classHost.appendChild(classTimeline(def, snapshots, classesBySnap)));

    const metricHost = el("metric-chart"); metricHost.innerHTML = "";
    lineChart(metricHost, dates, snapshots.map(snapshot => snapshot.active_players), "アクティブプレイヤー（1か月）", colors[0]);
    lineChart(metricHost, dates, snapshots.map(snapshot => snapshot.active_guilds), "アクティブギルド（1か月）", colors[1]);
  }

  async function load() {
    const query = new URLSearchParams();
    if (el("stats-from").value) query.set("from", el("stats-from").value);
    if (el("stats-to").value) query.set("to", el("stats-to").value);
    const response = await fetch("/api/saver-stats?" + query);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "取得に失敗しました");
    loaded = data; render();
  }

  function showError(error) {
    el("stats-error").hidden = false;
    el("stats-error").textContent = error.message;
  }
  el("stats-apply").onclick = () => load().catch(showError);
  el("stats-server").onchange = () => loaded && render();
  load().catch(showError);
})();
