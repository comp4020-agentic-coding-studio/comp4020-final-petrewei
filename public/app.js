// The trading floor's page. The server owns everything; this page draws
// what it sends and posts the buttons. Elements are updated in place, so a
// click is never lost to a redraw.
const $ = (id) => document.getElementById(id);
import { yen } from "/format.js";

let state = null;
// Forced closes seen so far; a new one takes the screen.
let cuts = null;
let fame = "";

// Leverage and stake are chip groups that hold their choice. What each
// leverage means is said beside it, in the parody's voice.
const NOTES = { 1: "sensible", 5: "", 10: "", 25: "Japan's legal cap", 100: "offshore", 400: "brave", 1000: "Leverage fixes everything~♪" };
const STAKES = [0.25, 0.5, 1];
const choice = { leverage: 25, stake: 1 };
function chips(id, values, label, key, risky = () => false) {
  $(id).replaceChildren(
    ...values.map((v) => {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "radio");
      b.textContent = label(v);
      b.dataset.value = v;
      if (risky(v)) b.classList.add("risky");
      b.onclick = () => {
        choice[key] = v;
        mark();
        if (state) ticket(state);
      };
      return b;
    }),
  );
}
function mark() {
  for (const [id, key] of [["leverage", "leverage"], ["stake", "stake"]]) {
    for (const b of $(id).children) b.setAttribute("aria-checked", String(Number(b.dataset.value) === choice[key]));
  }
  $("lev-note").textContent = NOTES[choice.leverage] ?? "";
}
chips("stake", STAKES, (v) => `${v * 100}%`, "stake");

// The market this page is on, from the tab, kept in the address so a
// shared link or a reload opens the same one.
const MODES = ["history", "live", "tutorial"];
let mode = MODES.includes(location.hash.slice(1)) ? location.hash.slice(1) : "history";

async function act(kind, extra = {}) {
  $("error").textContent = "";
  const res = await fetch("/api/act", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, mode, ...extra }) });
  if (!res.ok) $("error").textContent = (await res.json()).error ?? "Refused.";
}
const order = (kind) => () => act(kind, { leverage: choice.leverage, stake: choice.stake });
$("buy").onclick = order("buy");
$("sell").onclick = order("sell");
$("close").onclick = () => act("close");
$("pray").onclick = () => act("pray");
$("borrow").onclick = () => act("borrow");
$("lesson-next").onclick = () => act("next");
$("start").onclick = () => act("start");

// The lobby: a market waits for someone on the tab to press Start, then
// counts down so others can join.
function lobby(s) {
  const waiting = s.phase === "lobby" || s.phase === "countdown";
  $("lobby").hidden = s.mode === "tutorial" || !waiting;
  if (!waiting) return;
  const counting = s.phase === "countdown";
  const name = s.mode === "live" ? "Live" : "History";
  $("lobby-title").textContent = counting ? `Trading opens in ${s.countdown}s` : `${name} is waiting`;
  $("lobby-text").textContent = counting
    ? `${s.startedBy} pressed Start. Everyone on this tab is in the round.`
    : s.mode === "live"
      ? "Forty days from today's real rate, simulated. Anyone on this tab can start the next round, and everyone here plays it."
      : "Forty real trading days, the date hidden until the bell. Anyone on this tab can start the next round, and everyone here plays it.";
  $("start").hidden = counting;
}
$("restart").onclick = () => act("restart");

// The tutorial names the controls a lesson is about; the page highlights
// them.
const FOCUS = { chart: "chart", equity: "equity", pnl: "pnl-box", level: "level-box", leverage: "leverage-box", stake: "stake-box", buy: "buy", sell: "sell", close: "close", stop: "stop", borrow: "borrow" };
function lesson(s) {
  $("lesson").hidden = !s.lesson;
  for (const el of document.querySelectorAll(".focus")) el.classList.remove("focus");
  if (!s.lesson) return;
  const l = s.lesson;
  const moving = s.phase === "moving";
  $("lesson-n").textContent = l.finished ? "done" : `lesson ${l.n} of ${l.of}`;
  $("lesson-title").textContent = l.finished ? "Tutorial complete" : l.title;
  $("lesson-text").textContent = l.finished ? "Well done. Choose History or Live above to trade against other people, or start the tutorial again." : l.text;
  $("lesson-task").textContent = l.finished ? "Pick a tab above." : moving ? "Watch the chart…" : l.task;
  $("lesson-next").hidden = l.finished || moving || !/Next/.test(l.task);
  if (!l.finished && !moving) for (const f of l.focus) $(FOCUS[f])?.classList.add("focus");
}
$("stop").onclick = () => {
  const pos = state?.you.pos;
  if (!pos) return;
  act("stop", pos.stop ? {} : { pct: 1 });
};

// The ticket: the prices a sell and a buy fill at, and what the chosen
// order would put at stake, worked out from the account the server sent.
function ticket(s) {
  $("bid").textContent = s.bid.toFixed(s.digits);
  $("ask").textContent = s.ask.toFixed(s.digits);
  $("spread").textContent = `spread ${((s.ask - s.bid) / (s.digits === 3 ? 0.01 : 0.0001)).toFixed(1)} pips`;
  const free = Math.max(0, s.you.equity - (s.you.pos?.margin ?? 0));
  const margin = Math.floor(free * choice.stake);
  const controls = margin * choice.leverage;
  // At L× leverage, a move of 1/L against you is everything you put in.
  const wipe = 100 / choice.leverage;
  // With a position open, a same-side order adds to it and an opposite
  // one closes it, so the preview says which.
  const pos = s.you.pos;
  const move = `A ${wipe < 1 ? wipe.toFixed(2) : wipe.toFixed(0)}% move against you loses all of it.`;
  $("preview").replaceChildren(
    ...(pos
      ? margin > 0
        ? [`${pos.side === 1 ? "Buy" : "Sell"} adds `, strong(yen(margin)), ` at ${choice.leverage}×; ${pos.side === 1 ? "Sell" : "Buy"} closes your position.`]
        : [`All your money is in this position. ${pos.side === 1 ? "Sell" : "Buy"} closes it.`]
      : margin > 0
        ? ["Puts in ", strong(yen(margin)), " to control ", strong(yen(controls)), `. ${move}`]
        : ["No free money to trade with."]),
  );
}
const strong = (text) => Object.assign(document.createElement("strong"), { textContent: text });

function draw(s) {
  const canvas = $("chart");
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const css = getComputedStyle(document.documentElement);
  ctx.fillStyle = css.getPropertyValue("--chart");
  ctx.fillRect(0, 0, w, h);
  const prices = s.prices;
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const pad = (hi - lo) * 0.15 || hi * 0.002;
  const top = hi + pad;
  const bottom = lo - pad;
  const x = (i) => (i / s.total) * (w - 70);
  const y = (p) => h - ((p - bottom) / (top - bottom)) * h;
  // Day lines, and the price grid on the right.
  ctx.strokeStyle = css.getPropertyValue("--chart-grid");
  ctx.lineWidth = 1;
  const up = css.getPropertyValue("--up");
  const down = css.getPropertyValue("--down");
  ctx.fillStyle = css.getPropertyValue("--muted");
  ctx.font = "12px 'JetBrains Mono', ui-monospace, monospace";
  const k = s.steps;
  for (let d = 0; d * k <= s.total; d += 5) {
    const xd = x(d * k);
    ctx.beginPath();
    ctx.moveTo(xd, 0);
    ctx.lineTo(xd, h);
    ctx.stroke();
  }
  for (let k = 0; k <= 4; k++) {
    const p = bottom + ((top - bottom) * k) / 4;
    ctx.beginPath();
    ctx.moveTo(0, y(p));
    ctx.lineTo(w - 70, y(p));
    ctx.stroke();
    // Grid labels that would sit under the last-price tag are skipped.
    if (Math.abs(y(p) - y(prices.at(-1))) > 16) ctx.fillText(p.toFixed(s.digits), w - 66, Math.min(h - 4, Math.max(12, y(p) + 4)));
  }
  // The entry and the stop of my own position.
  const pos = s.you.pos;
  const level = (p, colour, label) => {
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = colour;
    ctx.beginPath();
    ctx.moveTo(0, y(p));
    ctx.lineTo(w - 70, y(p));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = colour;
    ctx.fillText(label, w - 70 - ctx.measureText(label).width - 6, y(p) - 4);
  };
  if (pos) level(pos.entry, pos.side === 1 ? up : down, `${pos.side === 1 ? "long" : "short"} ${pos.leverage}×`);
  if (pos?.stop) level(pos.stop, css.getPropertyValue("--call"), "stop");
  // One candle a day, then the price line through today's ticks.
  for (let d = 0; d * k < prices.length - 1; d++) {
    const day = prices.slice(d * k, d * k + k + 1);
    const open = day[0];
    const close = day.at(-1);
    const colour = close >= open ? up : down;
    const cx = x(d * k + k / 2);
    ctx.strokeStyle = colour;
    ctx.beginPath();
    ctx.moveTo(cx, y(Math.max(...day)));
    ctx.lineTo(cx, y(Math.min(...day)));
    ctx.stroke();
    ctx.fillStyle = colour;
    const bw = Math.max(3, x(k) * 0.6);
    ctx.fillRect(cx - bw / 2, y(Math.max(open, close)), bw, Math.max(1, Math.abs(y(open) - y(close))));
  }
  const last = prices.at(-1);
  ctx.strokeStyle = css.getPropertyValue("--chart-line");
  ctx.beginPath();
  ctx.moveTo(0, y(last));
  ctx.lineTo(w - 70, y(last));
  ctx.stroke();
  ctx.fillStyle = css.getPropertyValue("--chart-line");
  ctx.fillRect(w - 70, y(last) - 9, 70, 18);
  ctx.fillStyle = css.getPropertyValue("--chart");
  ctx.fillText(last.toFixed(s.digits), w - 66, y(last) + 4);
}

// The server sends the full history on joining and each phase, and after
// that only new prices. A gap (a missed message) asks for the whole state.
let prices = [];
let roundNo = 0;
let shown = null;
async function receive(s) {
  // A message from the market this page just left is dropped.
  if (s.mode !== mode) return;
  if (s.from === 0) prices = s.prices;
  else if (s.mode === shown && s.round === roundNo && s.from <= prices.length) prices = prices.slice(0, s.from).concat(s.prices);
  else {
    const res = await fetch(`/api/state?mode=${mode}`);
    return receive(await res.json());
  }
  roundNo = s.round;
  shown = s.mode;
  render({ ...s, prices });
}

function render(s) {
  state = s;
  const tutorial = s.mode === "tutorial";
  // Whether orders are taken now: a round's trading, or a tutorial whose
  // price is standing still for the player's move.
  const open = tutorial ? s.phase === "waiting" && !s.lesson.finished : s.phase === "trade";
  document.body.classList.toggle("tutorial", tutorial);
  lesson(s);
  lobby(s);
  for (const m of ["history", "live"]) $(`here-${m}`).textContent = s.here[m] ? `${s.here[m]} here` : "";
  // On first load the menu starts at the open position's leverage, if
  // any, so a reload shows what the player chose.
  if (!$("leverage").children.length) {
    choice.leverage = s.you.pos?.leverage ?? 25;
    chips("leverage", s.leverages, (v) => `${v}×`, "leverage", (v) => v >= 100);
    mark();
  }
  const price = s.prices.at(-1);
  const first = s.prices[0];
  $("pair").textContent = s.pair;
  $("price").textContent = price.toFixed(s.digits);
  const ch = (price / first - 1) * 100;
  $("change").textContent = `${ch >= 0 ? "+" : ""}${ch.toFixed(2)}%`;
  $("change").className = ch >= 0 ? "up" : "down";
  $("mode").textContent = tutorial ? "Tutorial: scripted prices" : s.simulated ? "Live: today's rate, then simulated" : "Replay: the date is hidden until the bell";
  $("title").textContent = tutorial ? "chart_practice.exe" : s.simulated ? "chart_live_sim.exe" : "chart_replay_????-??-??.exe";
  $("clock").textContent = tutorial ? "practice · private" : s.phase === "trade" ? `day ${Math.max(1, Math.ceil(s.tick / s.steps))} / ${s.total / s.steps}` : s.phase === "countdown" ? `opens in ${s.countdown}s` : s.phase === "lobby" ? "waiting for Start" : "market closed";
  // Built from text nodes: the name comes from the server, never as HTML.
  $("whoami").replaceChildren("You are ", strong(s.you.name), " ", Object.assign(document.createElement("code"), { textContent: s.you.code }));
  $("whoami").title = "This browser is your trader. Others see you by this name.";
  draw(s);
  ticket(s);

  const y = s.you;
  $("equity").textContent = yen(y.equity - y.debt);
  $("pnl").textContent = yen(y.pnl);
  $("pnl").className = y.pnl > 0 ? "up" : y.pnl < 0 ? "down" : "";
  $("level").textContent = y.level === null ? "—" : `${y.level}%`;
  // The meter runs from 0% to 200% margin level.
  const fill = y.level === null ? 100 : Math.min(100, y.level / 2);
  $("meter").style.width = `${fill}%`;
  $("meter").style.background = y.level === null || y.level > 100 ? "var(--up)" : y.level > 50 ? "var(--call)" : "var(--down)";
  $("borrow").hidden = !(y.broke && y.loansLeft > 0 && open);
  // Your position: one row with its own close and stop, as on any
  // platform, or a line saying what to do when there is none.
  $("pos-row").hidden = !y.pos;
  $("pos-empty").hidden = !!y.pos;
  if (y.pos) {
    const side = Object.assign(document.createElement("span"), { className: `tag ${y.pos.side === 1 ? "long" : "short"}`, textContent: y.pos.side === 1 ? "Long" : "Short" });
    $("pos-side").replaceChildren(side, ` ${s.pair} ${y.pos.leverage}×`);
    $("pos-entry").textContent = y.pos.entry.toFixed(s.digits);
    $("pos-now").textContent = price.toFixed(s.digits);
    $("pos-margin").textContent = yen(y.pos.margin);
    $("pos-pnl").textContent = yen(y.pnl);
    $("pos-pnl").className = y.pnl > 0 ? "up" : y.pnl < 0 ? "down" : "";
    $("stop").textContent = y.pos.stop ? `${y.pos.stop.toFixed(s.digits)} ✕` : "Add 1% stop";
    $("stop").title = y.pos.stop ? "Remove the stop" : "Close automatically if the price moves 1% against you";
  } else {
    $("position").textContent = y.broke && y.loansLeft > 0
      ? "You're broke. Dad's savings are right there…"
      : y.out
        ? "Wiped out, and Dad's savings are gone. Watch the others until the next round."
        : open
          ? "No open position. Pick a leverage, then Buy or Sell."
          : "No open position.";
  }
  if (y.debt) $("position").textContent += ` You owe Dad ${yen(y.debt)}.`;
  const closed = !open || y.out;
  for (const id of ["buy", "sell", "pray"]) $(id).disabled = closed;
  for (const id of ["close", "stop"]) $(id).disabled = closed || !y.pos;

  // The forced loss cut: a new stop-out or wipe-out takes the screen.
  if (cuts !== null && y.cuts > cuts) {
    $("losscut-sub").textContent = y.out ? "WIPED OUT · ZERO-CUT" : "FORCED LOSS CUT";
    $("losscut").hidden = false;
    setTimeout(() => ($("losscut").hidden = true), 2200);
  }
  cuts = y.cuts;

  const humans = s.traders.filter((t) => !t.bot).length;
  $("count").textContent = `${humans} human${humans === 1 ? "" : "s"}`;
  const list = $("traders");
  list.replaceChildren(
    ...s.traders.map((t) => {
      const li = document.createElement("li");
      li.className = `${t.you ? "you" : ""} ${t.out ? "out" : ""}`;
      const n = document.createElement("span");
      n.className = "n";
      n.textContent = t.name + (t.you ? " (you)" : "");
      if (t.bot) {
        n.title = t.motto ?? "";
        n.append(" ", Object.assign(document.createElement("span"), { className: "botmark", textContent: "bot" }));
      }
      const p = document.createElement("span");
      if (t.side) {
        p.className = `pos ${t.side === 1 ? "long" : "short"}`;
        p.textContent = `${t.side === 1 ? "▲" : "▼"} ${t.leverage}×`;
      }
      const e = document.createElement("span");
      e.textContent = yen(t.equity);
      e.className = `eq ${t.equity >= s.start ? "up" : "down"}`;
      li.append(n, p, e);
      return li;
    }),
  );
  $("feed").replaceChildren(
    ...s.feed.map((f) => {
      const li = document.createElement("li");
      li.className = `k-${f.kind}`;
      li.textContent = f.text;
      return li;
    }),
  );
  // The hall of fame changes only on busts and at the bell.
  const famed = JSON.stringify(s.career);
  if (famed !== fame) {
    fame = famed;
    $("career").replaceChildren(
      ...s.career.map((c) => {
        const tr = document.createElement("tr");
        if (c.you) tr.className = "you";
        for (const v of [c.name, c.rounds, yen(c.profit), c.wins, c.busts]) {
          const td = document.createElement("td");
          td.textContent = v;
          tr.append(td);
        }
        return tr;
      }),
    );
  }


  $("bell").hidden = s.phase !== "break" || !s.result;
  if (s.result) {
    $("reveal").textContent = s.result.reveal;
    $("next").textContent = s.breakLeft;
    $("ranking").replaceChildren(
      ...s.result.ranking.map((r) => {
        const li = document.createElement("li");
        if (r.you) li.className = "you";
        li.textContent = `${r.name}${r.you ? " (you)" : ""}: ${yen(r.balance)} (${yen(r.balance - s.start)})`;
        return li;
      }),
    );
  }
}

// One stream at a time, on the chosen market. Switching tabs closes it and
// opens the other; the two markets keep running either way.
let events = null;
function watch(next) {
  mode = next;
  history.replaceState(null, "", `#${mode}`);
  for (const tab of document.querySelectorAll("[role=tab]")) tab.setAttribute("aria-selected", String(tab.dataset.mode === mode));
  events?.close();
  shown = null;
  cuts = null;
  $("error").textContent = "";
  events = new EventSource(`/api/events?mode=${mode}`);
  events.onmessage = (e) => receive(JSON.parse(e.data));
}
for (const tab of document.querySelectorAll("[role=tab]")) tab.onclick = () => tab.dataset.mode !== mode && watch(tab.dataset.mode);
watch(mode);
