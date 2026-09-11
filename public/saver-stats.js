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
  const fallbackClassColors = [
    "#e53935", "#1e88e5", "#43a047", "#fb8c00", "#8e24aa", "#00acc1",
    "#f4511e", "#3949ab", "#7cb342", "#d81b60", "#00897b", "#6d4c41",
    "#5e35b1", "#039be5", "#c0ca33", "#fdd835", "#546e7a", "#ff7043",
    "#26a69a", "#ab47bc", "#29b6f6", "#9ccc65", "#ffa726", "#ec407a",
    "#7e57c2", "#26c6da", "#8d6e63", "#78909c", "#66bb6a", "#ef5350",
  ];
  const classColors = new Map(classDefs.map((def, index) => [def.name, fallbackClassColors[index]]));
  const hiddenClasses = new Set();
  let loaded = null;

  const el = id => document.getElementById(id);
  const fmt = n => n == null || Number(n) < 0 ? "—" : Number(n).toLocaleString("ja-JP");
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


  async function loadClassColors() {
    try {
      const response = await fetch("/class-colors.md", { cache: "no-cache" });
      if (!response.ok) return;
      const markdown = await response.text();
      markdown.split(/\r?\n/).forEach(line => {
        const match = line.match(/^\|\s*([^|]+?)\s*\|\s*`?(#[0-9a-f]{6})`?\s*\|/i);
        if (!match) return;
        const name = match[1].trim();
        if (classDefs.some(def => def.name === name)) classColors.set(name, match[2]);
      });
    } catch (_) {
      // 設定ファイルが読めない場合は組み込み色を使う。
    }
  }

  function combinedClassChart(host, snapshots, classesBySnap) {
    host.innerHTML = "";
    if (!snapshots.length) {
      host.innerHTML = "<p>この期間のデータはありません。</p>";
      return;
    }

    const legend = document.createElement("div");
    legend.className = "chart-legend class-legend";
    const chart = document.createElement("div");
    chart.className = "svg-chart class-band-chart";
    const rows = [...snapshots].reverse();
    const visibleDefs = classDefs.filter(def => !hiddenClasses.has(def.name));

    const width = 3000, rowH = 68, barH = 52, pad = { l: 96, r: 84, t: 14, b: 14 };
    const plotW = width - pad.l - pad.r;
    const height = pad.t + pad.b + rows.length * rowH;
    const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": "日付別の職Top1000帯グラフ" });
    svg.appendChild(svgEl("title")).textContent = "日付ごとに1本で表示した職Top1000構成";

    rows.forEach((snapshot, rowIndex) => {
      const values = classesBySnap.get(snapshot.id) || new Map();
      const total = visibleDefs.reduce((sum, def) => sum + (values.get(def.name) || 0), 0);
      const positiveCount = visibleDefs.filter(def => (values.get(def.name) || 0) > 0).length;
      const minSegmentW = 64;
      const flexibleW = Math.max(0, plotW - positiveCount * minSegmentW);
      const y = pad.t + rowIndex * rowH + (rowH - barH) / 2;
      const date = svgEl("text", { x: pad.l - 10, y: y + barH / 2 + 4, "text-anchor": "end", class: "band-date" });
      date.textContent = snapshot.captured_date;
      svg.appendChild(date);
      svg.appendChild(svgEl("rect", { x: pad.l, y, width: plotW, height: barH, rx: 3, class: "band-track" }));

      let offset = 0;
      visibleDefs.forEach(def => {
        const value = values.get(def.name) || 0;
        if (!value || !total) return;
        const segmentW = minSegmentW + value / total * flexibleW;
        const color = classColors.get(def.name) || "#667085";
        const rect = svgEl("rect", {
          x: pad.l + offset, y, width: segmentW, height: barH,
          fill: color, class: "band-segment", "data-class": def.name,
        });
        rect.appendChild(svgEl("title")).textContent =
          `${snapshot.captured_date} / ${def.name}: ${fmt(value)}人（${(value / total * 100).toFixed(1)}%）`;
        svg.appendChild(rect);
        const codeLabel = svgEl("text", {
          x: pad.l + offset + segmentW / 2, y: y + 20,
          "text-anchor": "middle", class: "band-code",
        });
        codeLabel.textContent = def.code;
        svg.appendChild(codeLabel);
        const countLabel = svgEl("text", {
          x: pad.l + offset + segmentW / 2, y: y + 41,
          "text-anchor": "middle", class: "band-count",
        });
        countLabel.textContent = `${fmt(value)}人`;
        svg.appendChild(countLabel);
        offset += segmentW;
      });

      const totalLabel = svgEl("text", { x: width - pad.r + 10, y: y + barH / 2 + 4, class: "band-total" });
      totalLabel.textContent = `${fmt(total)}人`;
      svg.appendChild(totalLabel);
    });

    classDefs.forEach(def => {
      const color = classColors.get(def.name) || "#667085";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "legend-item" + (hiddenClasses.has(def.name) ? " off" : "");
      button.innerHTML = `<i style="background:${color}"></i><img src="${def.icon}" alt="">${def.name}`;
      button.setAttribute("aria-pressed", String(!hiddenClasses.has(def.name)));
      button.onclick = () => {
        if (hiddenClasses.has(def.name)) hiddenClasses.delete(def.name);
        else hiddenClasses.add(def.name);
        combinedClassChart(host, snapshots, classesBySnap);
      };
      legend.appendChild(button);
    });

    chart.appendChild(svg);
    host.append(legend, chart);
  }

  function buildClassesBySnapshot() {
    const result = new Map();
    loaded.classes.forEach(item => {
      if (!result.has(item.snapshot_id)) result.set(item.snapshot_id, new Map());
      const name = aliases[item.class_name] || item.class_name;
      const values = result.get(item.snapshot_id);
      values.set(name, (values.get(name) || 0) + item.player_count);
    });
    return result;
  }

  function renderLatestTopClasses(latest, classesBySnap) {
    const host = el("latest-class-top5");
    if (!latest) {
      host.innerHTML = "";
      return;
    }
    const values = classesBySnap.get(latest.id) || new Map();
    const ranking = classDefs.map(def => ({ ...def, value: values.get(def.name) || 0 }))
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
      .slice(0, 5);
    host.innerHTML = `<div class="top5-head"><h3>最新データ 使用者数TOP5</h3><small>${latest.captured_date}</small></div><div class="class-top5">` +
      ranking.map((item, index) => `<article><b>${index + 1}</b><img src="${item.icon}" alt=""><span><strong>${item.name}</strong><small>${item.code}</small></span><em>${fmt(item.value)}人</em></article>`).join("") +
      "</div>";
  }

  async function downloadClassChartPng() {
    if (!loaded) return;
    const button = el("stats-png");
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "PNG作成中…";
    try {
      const server = el("stats-server").value;
      const snapshots = loaded.snapshots.filter(snapshot => snapshot.server === server);
      if (!snapshots.length) throw new Error("PNGにするデータがありません。");
      const classesBySnap = buildClassesBySnapshot();
      const rows = [...snapshots].reverse();
      const minSegmentW = 76;
      const pixelsPerPlayer = 3;
      const labelW = 180, rightW = 150, padding = 42;
      const rowH = 88, barH = 62, headerH = 160;
      const legendCols = 5, legendRowH = 46;
      const legendH = Math.ceil(classDefs.length / legendCols) * legendRowH + 80;
      const rowSegments = rows.map(snapshot => {
        const values = classesBySnap.get(snapshot.id) || new Map();
        const segments = classDefs.map(def => {
          const value = values.get(def.name) || 0;
          return { ...def, value, width: value > 0 ? Math.max(value * pixelsPerPlayer, minSegmentW) : 0 };
        });
        return { snapshot, segments, width: segments.reduce((sum, item) => sum + item.width, 0) };
      });
      const bandW = Math.max(3000, ...rowSegments.map(row => row.width));
      const canvas = document.createElement("canvas");
      canvas.width = padding + labelW + bandW + rightW + padding;
      canvas.height = headerH + rows.length * rowH + legendH + padding;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("画像を作成できませんでした。");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#1f2933";
      ctx.font = "bold 34px Meiryo, sans-serif";
      ctx.fillText("職 Top1000 帯グラフ", padding, 54);
      ctx.font = "bold 26px Meiryo, sans-serif";
      ctx.fillText(`サーバー: ${server}`, padding, 98);
      const from = el("stats-from").value || rows[rows.length - 1].captured_date;
      const to = el("stats-to").value || rows[0].captured_date;
      ctx.font = "24px Meiryo, sans-serif";
      ctx.fillText(`期間: ${from} ～ ${to}`, padding, 134);

      rowSegments.forEach((row, rowIndex) => {
        const y = headerH + rowIndex * rowH + (rowH - barH) / 2;
        ctx.fillStyle = "#26332d";
        ctx.font = "bold 22px Meiryo, sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(row.snapshot.captured_date, padding + labelW - 16, y + 39);
        let x = padding + labelW;
        row.segments.forEach(item => {
          if (!item.width) return;
          ctx.fillStyle = classColors.get(item.name) || "#667085";
          ctx.fillRect(x, y, item.width, barH);
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, item.width, barH);
          ctx.fillStyle = "#ffffff";
          ctx.textAlign = "center";
          ctx.font = "bold 18px Arial, sans-serif";
          ctx.fillText(item.code, x + item.width / 2, y + 25);
          ctx.font = "bold 17px Meiryo, sans-serif";
          ctx.fillText(`${fmt(item.value)}人`, x + item.width / 2, y + 50);
          x += item.width;
        });
        const total = row.segments.reduce((sum, item) => sum + item.value, 0);
        ctx.fillStyle = "#26332d";
        ctx.font = "bold 22px Meiryo, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(`${fmt(total)}人`, x + 14, y + 39);
      });

      const legendTop = headerH + rows.length * rowH + 42;
      ctx.textAlign = "left";
      ctx.fillStyle = "#1f2933";
      ctx.font = "bold 25px Meiryo, sans-serif";
      ctx.fillText("職カラー・略称", padding, legendTop);
      const colW = (canvas.width - padding * 2) / legendCols;
      classDefs.forEach((def, index) => {
        const col = index % legendCols;
        const row = Math.floor(index / legendCols);
        const x = padding + col * colW;
        const y = legendTop + 28 + row * legendRowH;
        ctx.fillStyle = classColors.get(def.name) || "#667085";
        ctx.fillRect(x, y, 30, 30);
        ctx.fillStyle = "#26332d";
        ctx.font = "bold 18px Arial, sans-serif";
        ctx.fillText(def.code, x + 42, y + 22);
        ctx.font = "18px Meiryo, sans-serif";
        ctx.fillText(def.name, x + 82, y + 22);
      });

      const blob = await new Promise((resolve, reject) =>
        canvas.toBlob(value => value ? resolve(value) : reject(new Error("PNG変換に失敗しました。")), "image/png")
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `SaverStats_${server}_${from}_${to}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      showError(error);
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
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

    const classesBySnap = buildClassesBySnapshot();
    combinedClassChart(el("class-chart"), snapshots, classesBySnap);
    renderLatestTopClasses(latest, classesBySnap);

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
    await loadClassColors();
    loaded = data; render();
  }

  function showError(error) {
    el("stats-error").hidden = false;
    el("stats-error").textContent = error.message;
  }
  el("stats-apply").onclick = () => load().catch(showError);
  el("stats-png").onclick = downloadClassChartPng;
  el("stats-server").onchange = () => loaded && render();
  load().catch(showError);
})();
