/** サーバー側HTMLレンダリング */
import { BoardRow, Week, holdingSummary } from "./board";
import { Ledger, NodeRow, TIER_LABEL, WEEKDAY_JA, addDays, tierRank } from "./calc";

export const esc = (s: unknown): string =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const num = (v: number | null | undefined) => (v === null || v === undefined ? "—" : String(v));
const tierCls = (tier: string) => (tier === "castle" ? "tcastle" : `t${tier}`);

export interface PageData {
  week: Week;
  ledger: Ledger;
  nodes: NodeRow[];
  guilds: { id: number; name: string; note: string; active: number }[];
  activeGuilds: { id: number; name: string }[];
  startDate: string;
  today: string;
  canEdit: boolean;
  authEnabled: boolean;
}

function boardRowHtml(r: BoardRow, date: string, canEdit: boolean): string {
  const ro = canEdit ? "" : " disabled";
  return `<tr class="brow" data-date="${date}" data-node="${r.nodeId}"
    data-eligible="${r.eligible.join(",")}"
    data-participants="${r.participants.map((p) => p.guildId).join(",")}">
  <td class="node">${esc(r.name)}</td>
  <td class="c"><span class="tierbadge ${tierCls(r.tier)}">${esc(r.tierLabel)}</span></td>
  <td class="c">${r.timeCode ?? "-"}</td>
  <td class="c">${r.fortress ? "城" : "-"}</td>
  <td class="c">${r.bidSlots ?? "-"}</td>
  <td class="c">${r.capacity ?? "-"}</td>
  <td class="holder${r.isVacant ? " vacant" : ""}">${esc(r.holder || "（空席）")}</td>
  <td class="c">${num(r.holdingDays)}</td>
  <td class="tax ${r.heat}">${num(r.vacancyDays)}</td>
  <td class="in c"><input type="checkbox" class="chk f-unified"${r.unified ? " checked" : ""}${ro}></td>
  <td class="in c"><input type="checkbox" class="chk f-banquet"${r.banquet ? " checked" : ""}${ro}></td>
  <td class="in"><button type="button" class="pbtn f-participants${r.participants.length ? "" : " blank"}"${ro}>${
    r.participants.length
      ? esc(r.participants.map((p) => p.name).join("、"))
      : "＋ 対戦ギルドを選ぶ"
  }</button></td>
  <td class="in"><select class="cell f-winner${r.winnerGuildId ? "" : " blank"}"${ro}><option value="">— 未確定 —</option></select></td>
</tr>`;
}

function dayHtml(day: Week["days"][number], canEdit: boolean): string {
  const head = `<tr>
  <th rowspan="2">${day.isCastleDay ? "城" : "拠点"}</th>
  <th rowspan="2">級</th><th rowspan="2">時</th><th rowspan="2">塞</th>
  <th rowspan="2">枠</th><th rowspan="2">人数</th>
  <th rowspan="2" class="holdgrp">いま保有しているギルド</th>
  <th rowspan="2" class="holdgrp">保有<br><span class="mini">日数</span></th>
  <th rowspan="2" class="holdgrp">税<br><span class="mini">空席日数</span></th>
  <th class="ingrp" colspan="4">▼ 入力する欄</th>
</tr>
<tr>
  <th class="ingrp">統一</th><th class="ingrp">宴会</th>
  <th class="ingrp">${day.isCastleDay ? "攻城1・攻城2" : "対戦ギルド"}</th>
  <th class="ingrp">勝ったギルド</th>
</tr>`;
  return `<div class="daysec${day.isToday ? " today" : ""}">
  <div class="dayhead">
    <span class="dt">${day.weekdayJa}　${day.dateShort}</span>
    <span class="cnt">${day.isCastleDay ? `攻城戦 ${day.count}城` : `${day.count}拠点`}</span>
    <span class="spacer"></span>
    <span class="prog${day.done === day.count ? " done" : ""}">勝者入力 ${day.done}/${day.count}</span>
  </div>
  <table class="xl">${head}${day.rows.map((r) => boardRowHtml(r, day.date, canEdit)).join("")}</table>
  ${day.isCastleDay ? '<div style="padding:5px 9px;" class="mini">入札できるのは、2等級または3等級（または城）を保有しているギルドのみ</div>' : ""}
</div>`;
}

function nodeMasterHtml(nodes: NodeRow[], canEdit: boolean): string {
  const wkRank: Record<string, number> = { mon: 0, thu: 1, fri: 2, sun: 3, sat: 4 };
  const sorted = [...nodes].sort((a, b) => {
    const w = (wkRank[a.weekday] ?? 9) - (wkRank[b.weekday] ?? 9);
    if (w !== 0) return w;
    const t = tierRank(b.tier) - tierRank(a.tier);
    return t !== 0 ? t : a.slot < b.slot ? -1 : a.slot > b.slot ? 1 : 0;
  });
  const ro = canEdit ? "" : " disabled";
  const wkOpts = (cur: string) =>
    [["mon", "月"], ["thu", "木"], ["fri", "金"], ["sat", "土"], ["sun", "日"]]
      .map(([k, ja]) => `<option value="${k}"${cur === k ? " selected" : ""}>${ja}</option>`).join("");
  const tierOpts = (cur: string) =>
    [["3", "3"], ["2", "2"], ["1", "1"], ["castle", "城"]]
      .map(([k, ja]) => `<option value="${k}"${cur === k ? " selected" : ""}>${ja}</option>`).join("");

  let out = "";
  let lastWk = "";
  for (const n of sorted) {
    if (n.weekday !== lastWk) {
      lastWk = n.weekday;
      const cnt = sorted.filter((x) => x.weekday === n.weekday).length;
      out += `<tr class="daybreak"><td colspan="12">${WEEKDAY_JA[n.weekday]}曜　${cnt}拠点</td></tr>`;
    }
    out += `<tr class="nrow" data-id="${n.id}">
  <td class="c"><select class="f-weekday"${ro}>${wkOpts(n.weekday)}</select></td>
  <td><input type="text" class="f-slot w60" value="${esc(n.slot)}"${ro}></td>
  <td><input type="text" class="f-name" value="${esc(n.name)}"${ro}></td>
  <td class="c"><select class="f-tier"${ro}>${tierOpts(n.tier)}</select></td>
  <td class="c"><input type="text" class="f-time w44" value="${n.time_code ?? ""}"${ro}></td>
  <td class="c"><input type="checkbox" class="f-fortress"${n.fortress ? " checked" : ""}${ro}></td>
  <td class="c"><input type="text" class="f-capacity w44" value="${n.capacity ?? ""}"${ro}></td>
  <td class="c"><input type="text" class="f-slots w44" value="${n.bid_slots ?? ""}"${ro}></td>
  <td><input type="text" class="f-effect" value="${esc(n.effect)}"${ro}></td>
  <td class="c"><input type="text" class="f-from w60" value="${esc(n.effective_from)}"${ro}></td>
  <td class="c"><input type="checkbox" class="f-active"${n.active ? " checked" : ""}${ro}></td>
  <td class="c">${canEdit ? '<button class="btn node-save">保存</button>' : ""}</td>
</tr>`;
  }
  return out;
}

export function renderPage(d: PageData): string {
  const { week, ledger, canEdit } = d;
  const ranking = ledger.taxRanking(10);
  const top = ranking.length && ranking[0].vacancyDays ? ranking[0].vacancyDays : 1;
  const held = ledger.guildHeldNode();
  const ro = canEdit ? "" : " disabled";

  const history: string[] = [];
  const hist: {
    node: string; acquired: string; guild: string; released: string | null;
    holdingDays: number | null; vacancyDays: number | null; isInitial: boolean;
  }[] = [];
  for (const [nodeId, st] of ledger.states) {
    for (const occ of st.occupations) {
      hist.push({
        node: ledger.nodeById.get(nodeId)!.name,
        acquired: occ.acquired, guild: occ.guildName, released: occ.released,
        holdingDays: occ.holdingDays, vacancyDays: occ.vacancyDays, isInitial: occ.isInitial,
      });
    }
  }
  hist.sort((a, b) => (a.acquired === b.acquired ? (a.node < b.node ? 1 : -1) : a.acquired < b.acquired ? 1 : -1));
  for (const h of hist.slice(0, 300)) {
    history.push(`<tr><td>${esc(h.node)}</td><td>${h.acquired}</td><td>${esc(h.guild)}</td>
      <td>${h.released ?? "—（保有中）"}</td><td class="c">${num(h.holdingDays)}</td>
      <td class="c">${num(h.vacancyDays)}</td>
      <td class="mini">${h.isInitial ? "運用開始時の初期登録" : ""}</td></tr>`);
  }
  if (!history.length) {
    history.push('<tr><td colspan="7" class="mini">まだ記録がありません。週次ボードで勝ったギルドを入力すると、ここに積み上がります。</td></tr>');
  }

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>拠点戦・税収管理ボード</title>
<link rel="stylesheet" href="/app.css">
</head>
<body data-monday="${week.monday}" data-today="${d.today}" data-canedit="${canEdit ? 1 : 0}">

<div class="ribbon">
  <span class="title">拠点戦・税収管理ボード</span>
  <span class="chip">鯖統合</span>
  <span class="spacer"></span>
  <span class="chip">運用開始 ${d.startDate}</span>
  <span class="chip">本日 ${d.today}</span>
  ${d.authEnabled
      ? canEdit
        ? '<a class="chip" href="/logout" style="color:#fff;text-decoration:none">編集モード（ログアウト）</a>'
        : '<a class="chip" href="/login" style="color:#fff;text-decoration:none">閲覧のみ（ログイン）</a>'
      : ""}
</div>

<div class="toolbar">
  <div class="weeknav">
    <a class="btn" href="/?week=${addDays(week.monday, -7)}">◀ 前の週</a>
    <span>${week.label}</span>
    <a class="btn" href="/?week=${addDays(week.monday, 7)}">次の週 ▶</a>
  </div>
  <div class="sep"></div>
  ${canEdit ? '<button class="btn primary" id="btn-save">保存</button>' : ""}
  <a class="btn excel" href="/export.xlsx">全データをExcelでダウンロード</a>
  <div class="sep"></div>
  <span class="status" id="status">${canEdit ? "読み込み完了" : "閲覧のみ（編集するにはログイン）"}</span>
</div>

<div class="pane active" id="pane-board">
<div class="pane-inner">
  <div class="guide">
    <div class="g"><span class="num">1</span><b>統一・宴会を入れる</b><br>
      <span class="when">月曜 朝10時までに、月・木・金・日の4日分をまとめて</span></div>
    <div class="g"><span class="num">2</span><b>対戦ギルドを入れる</b><br>
      <span class="when">当日 朝10時に19時開催分、12時に21時開催分が判明</span></div>
    <div class="g"><span class="num">3</span><b>勝ったギルドを選ぶ</b><br>
      <span class="when">結果が出次第。2で入れた対戦ギルドの中から選択</span></div>
  </div>
  <div class="legend">
    <span><span class="sw"></span>黄色いセル＝入力する欄</span>
    <span><span class="sw2"></span>白いセル＝自動計算・マスタ表示</span>
    <span>税＝空席日数（前回の放棄日→今回の獲得日）。長いほど勝ったときの利益が大きい</span>
  </div>

<div class="cols">
<div class="colmain">
${week.days.map((day) => dayHtml(day, canEdit)).join("")}
</div>

<div class="colside">
  <div class="card">
    <div class="cardhead">税収ランキング（空席日数）</div>
    <div class="cardbody">
      <div class="mini" style="margin-bottom:5px;">空席が長いほど、勝ったときの利益が大きい</div>
      ${ranking.map((item, i) => `<div class="rank-row">
        <span class="no">${i + 1}</span>
        <span class="nm">${esc(item.name)}${item.isVacant ? ' <span class="mini">空席</span>' : ""}</span>
        <span class="bar"><i style="width:${Math.round(((item.vacancyDays ?? 0) / top) * 100)}%"></i></span>
        <span class="vl">${num(item.vacancyDays)}</span></div>`).join("")}
    </div>
  </div>

  <div class="card">
    <div class="cardhead">保有状況サマリ</div>
    <div class="cardbody">
      <table class="xl">
        <tr><th>級</th><th>拠点</th><th>保有中</th><th>空席</th></tr>
        ${holdingSummary(ledger).map((s) => `<tr>
          <td class="c"><span class="tierbadge ${tierCls(s.tier)}">${s.tierLabel}</span></td>
          <td class="c">${s.total}</td><td class="c">${s.held}</td><td class="c">${s.vacant}</td></tr>`).join("")}
      </table>
    </div>
  </div>

  <div class="card">
    <div class="cardhead">入札権のルール</div>
    <div class="cardbody mini" style="line-height:1.8;">
      城 ＞ 3 ＞ 2 ＞ 1<br>
      ・保有等級と同じか上の等級にのみ入札可<br>
      ・下位等級へは入札できない<br>
      ・無所属は 1〜3 に入札可（攻城戦は不可）<br>
      ・攻城戦は 2 か 3 の保有ギルドのみ<br>
      ・勝つと元の拠点を手放して移動／負けても保持
    </div>
  </div>
</div>
</div>
</div>
</div>

<div class="pane" id="pane-nodes">
  <div class="pane-inner">
    <div class="hintbox">
      拠点の等級・開催曜日・枠は<b>今後変わる前提</b>なので、税収の計算ロジックとは切り離してここで管理します。
      ここを書き換えるだけで週次ボードの並びが変わり、計算式には手を入れません。
      並び順：開催曜日（月→木→金→日→土）→ 等級（3→2→1）
    </div>
    ${canEdit ? `
    <div class="hintbox importbox">
      <b>運用開始時、最初の1回だけ</b> — 「今どこを誰が持っているか」をここで登録します。
      <a href="/export/initial-template.csv">テンプレートCSVをダウンロード</a>して、
      「現保有ギルド」「獲得日」「前回放棄日」を埋めて下に貼り付け、「取り込む」を押してください。
      <b>これ以降は週次ボードの入力がそのまま反映される</b>ので、この作業は最初の1回だけで大丈夫です。
      拠点名・ギルド名はここに登録されているものと完全に同じ表記である必要があります。
      <div class="importrow">
        <textarea id="initial-import-text" rows="4" placeholder="埋めたテンプレートCSVの中身をここに貼り付け"></textarea>
        <div><button class="btn" id="initial-import-btn" type="button">取り込む</button>
        <label class="filebtn">ファイルを選ぶ<input type="file" id="initial-import-file" accept=".csv,text/csv" hidden></label></div>
      </div>
      <div id="initial-import-result" class="importresult"></div>
    </div>` : ""}
    <table class="master" id="node-table">
      <tr><th>曜日</th><th>枠</th><th>拠点名</th><th>等級</th><th>時刻</th><th>城塞</th>
      <th>人数</th><th>枠数</th><th>拠点効果</th><th>適用開始日</th><th>有効</th><th></th></tr>
      ${nodeMasterHtml(d.nodes, canEdit)}
    </table>
    ${canEdit ? '<p><button class="btn primary" id="node-add">＋ 拠点を追加</button></p>' : ""}
  </div>
</div>

<div class="pane" id="pane-guilds">
  <div class="pane-inner">
    <div class="hintbox">
      <b>ここがギルドの管理元です。</b>週次ボードの「対戦ギルド」「勝ったギルド」に出てくる候補は、すべてこの一覧から来ています。<br>
      古いものは「有効」のチェックを外せば候補から消えますが、過去の記録は残ります。<br>
      「現保有拠点」は週次ボードの入力結果から<b>自動で更新</b>されます（手入力しません）。
    </div>
    ${canEdit ? `
    <div class="hintbox importbox">
      <b>guild_master.csv を編集したとき</b> — ファイルの中身をそのまま下に貼り付けて「取り込む」を押すと、
      名前が一致するギルドは<b>メモを上書き</b>、新しい名前は<b>追加</b>されます（削除・無効化はされません）。
      これで週次ボードのプルダウンと確認用Excelの両方に反映されます。
      <div class="importrow">
        <textarea id="guild-import-text" rows="4" placeholder="guild_master.csv の中身をここに貼り付け（1行目はヘッダーでOK）"></textarea>
        <div><button class="btn" id="guild-import-btn" type="button">取り込む</button>
        <label class="filebtn">ファイルを選ぶ<input type="file" id="guild-import-file" accept=".csv,text/csv" hidden></label></div>
      </div>
      <div id="guild-import-result" class="importresult"></div>
    </div>` : ""}
    <table class="master" id="guild-table">
      <tr><th>ギルド名</th><th>メモ</th><th>現保有拠点</th><th>級</th><th>有効</th><th></th></tr>
      ${d.guilds.map((g) => {
        const nodeId = held.get(g.id);
        const node = nodeId ? ledger.nodeById.get(nodeId) : undefined;
        return `<tr class="grow" data-id="${g.id}"${g.active ? "" : ' style="opacity:.5"'}>
          <td><input type="text" class="f-name" value="${esc(g.name)}"${ro}></td>
          <td><input type="text" class="f-note" value="${esc(g.note)}"${ro}></td>
          <td class="mini">${esc(node ? node.name : "—")}</td>
          <td class="c mini">${node ? TIER_LABEL[node.tier] : "—"}</td>
          <td class="c"><input type="checkbox" class="f-active"${g.active ? " checked" : ""}${ro}></td>
          <td class="c">${canEdit ? '<button class="btn guild-save">保存</button>' : ""}</td></tr>`;
      }).join("")}
    </table>
    ${canEdit ? '<p><button class="btn primary" id="guild-add">＋ ギルドを追加</button></p>' : ""}
  </div>
</div>

<div class="pane" id="pane-history">
  <div class="pane-inner">
    <div class="hintbox">
      拠点ごとの占領・放棄の記録です。税（空席日数）がどう算出されたかを確認できます。<br>
      放棄日は「その拠点で次に決着がついた日」または「そのギルドが他の拠点で勝った日」の早い方です。
    </div>
    <table class="master">
      <tr><th>拠点</th><th>獲得日</th><th>占領ギルド</th><th>放棄日</th><th>保有日数</th><th>空席日数（税）</th><th></th></tr>
      ${history.join("")}
    </table>
  </div>
</div>

<div class="tabs">
  <div class="tab active" data-pane="pane-board">週次ボード</div>
  <div class="tab" data-pane="pane-nodes">拠点マスタ</div>
  <div class="tab" data-pane="pane-guilds">ギルド管理</div>
  <div class="tab" data-pane="pane-history">履歴</div>
</div>
<div class="statusbar">
  <span>拠点 ${ledger.nodeById.size} ／ ギルド ${d.guilds.length}</span>
  <span>税＝空席日数（前回の放棄日→今回の獲得日）</span>
  <span>運用開始 ${d.startDate}</span>
</div>

<div class="modal-bg" id="modal">
  <div class="modal">
    <div class="mhead"><span id="modal-title">対戦ギルドを選ぶ</span>
      <span class="sub" id="modal-sub"></span></div>
    <div class="mbody">
      <input type="text" class="search" id="modal-search" placeholder="ギルド名で絞り込み">
      <div class="glist" id="modal-list"></div>
    </div>
    <div class="mfoot">
      <button class="btn" id="modal-clear">クリア</button>
      <button class="btn" id="modal-cancel">キャンセル</button>
      <button class="btn primary" id="modal-ok">決定</button>
    </div>
  </div>
</div>
<div class="toast" id="toast"></div>

<script>
window.GUILDS = ${JSON.stringify(d.activeGuilds)};
window.WINNERS = ${JSON.stringify(
    Object.fromEntries(week.days.flatMap((day) =>
      day.rows.map((r) => [`${day.date}_${r.nodeId}`, r.winnerGuildId])))
  )};
</script>
<script src="/app.js"></script>
</body>
</html>`;
}

export function renderLogin(error?: string): string {
  return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ログイン｜拠点戦・税収管理ボード</title>
<link rel="stylesheet" href="/app.css"></head>
<body>
<div class="ribbon"><span class="title">拠点戦・税収管理ボード</span></div>
<div class="pane-inner" style="max-width:420px;margin:40px auto;">
  <div class="card">
    <div class="cardhead">編集するにはパスワードを入力してください</div>
    <div class="cardbody">
      ${error ? `<p style="color:#a33;font-size:12px;">${esc(error)}</p>` : ""}
      <form method="post" action="/login">
        <input type="password" name="password" class="search" placeholder="パスワード" autofocus>
        <button class="btn primary" type="submit">ログイン</button>
        <a class="btn" href="/">閲覧だけする</a>
      </form>
    </div>
  </div>
</div>
</body></html>`;
}
