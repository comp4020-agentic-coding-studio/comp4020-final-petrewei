// The trading floor's page. The server owns everything; this page draws
// what it sends and posts the buttons. Elements are updated in place, so a
// click is never lost to a redraw.
const $ = (id) => document.getElementById(id);
import { yen } from "/format.js";

let state = null;
// Forced closes seen so far; a new one takes the screen.
let cuts = null;
let fame = "";

const lev = $("leverage");
const LABELS = { 1: "1× (sensible)", 5: "5×", 10: "10×", 25: "25× (Japan's legal cap)", 100: "100× (offshore)", 400: "400× (brave)", 1000: "1000× (Leverage fixes everything~♪)" };

async function act(kind, extra = {}) {
  $("error").textContent = "";
  const res = await fetch("/api/act", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, ...extra }) });
  if (!res.ok) $("error").textContent = (await res.json()).error ?? "Refused.";
}
const order = (kind) => () => act(kind, { leverage: Number(lev.value), stake: Number($("stake").value) });
$("buy").onclick = order("buy");
$("sell").onclick = order("sell");
$("close").onclick = () => act("close");
$("pray").onclick = () => act("pray");
$("borrow").onclick = () => act("borrow");
$("stop").onclick = () => {
  const pos = state?.you.pos;
  if (pos.stop) return act("stop", { at: null });
  const price = state.prices.at(-1);
  act("stop", { at: price * (1 - pos.side * 0.01) });
};

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
  ctx.fillStyle = "#b9a6cf";
  ctx.font = "12px ui-monospace, monospace";
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
    ctx.fillText(p.toFixed(s.digits), w - 66, Math.min(h - 4, Math.max(12, y(p) + 4)));
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
  if (pos) level(pos.entry, pos.side === 1 ? "#12a37a" : "#e5384f", `${pos.side === 1 ? "long" : "short"} ${pos.leverage}×`);
  if (pos?.stop) level(pos.stop, "#ff9f1c", "stop");
  // One candle a day, then the price line through today's ticks.
  for (let d = 0; d * k < prices.length - 1; d++) {
    const day = prices.slice(d * k, d * k + k + 1);
    const open = day[0];
    const close = day.at(-1);
    const colour = close >= open ? "#12a37a" : "#e5384f";
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
  ctx.fillStyle = "#1f1530";
  ctx.fillText(last.toFixed(s.digits), w - 66, y(last) + 4);
}

// The server sends the full history on joining and each phase, and after
// that only new prices. A gap (a missed message) asks for the whole state.
let prices = [];
let roundNo = 0;
async function receive(s) {
  if (s.from === 0) prices = s.prices;
  else if (s.round === roundNo && s.from <= prices.length) prices = prices.slice(0, s.from).concat(s.prices);
  else {
    const res = await fetch("/api/state");
    return receive(await res.json());
  }
  roundNo = s.round;
  render({ ...s, prices });
}

function render(s) {
  state = s;
  if (!lev.options.length) {
    for (const l of s.leverages) lev.add(new Option(LABELS[l] ?? `${l}×`, l, false, l === 25));
  }
  const price = s.prices.at(-1);
  const first = s.prices[0];
  $("pair").textContent = s.pair;
  $("price").textContent = price.toFixed(s.digits);
  const ch = (price / first - 1) * 100;
  $("change").textContent = `${ch >= 0 ? "+" : ""}${ch.toFixed(2)}%`;
  $("change").className = ch >= 0 ? "up" : "down";
  $("mode").textContent = s.simulated ? "LIVE start · simulated moves" : "REPLAY · date hidden";
  $("title").textContent = s.simulated ? "chart_live_sim.exe" : "chart_replay_????-??-??.exe";
  $("clock").textContent = s.phase === "trade" ? `day ${Math.floor(s.tick / s.steps) + 1} / ${s.total / s.steps}` : "market closed";
  $("who").textContent = s.you.name;
  draw(s);

  const y = s.you;
  $("equity").textContent = yen(y.equity - y.debt);
  $("pnl").textContent = yen(y.pnl);
  $("pnl").className = y.pnl > 0 ? "up" : y.pnl < 0 ? "down" : "";
  $("level").textContent = y.level === null ? "—" : `${y.level}%`;
  // The meter runs from 0% to 200% margin level.
  const fill = y.level === null ? 100 : Math.min(100, y.level / 2);
  $("meter").style.width = `${fill}%`;
  $("meter").style.background = y.level === null || y.level > 100 ? "var(--up)" : y.level > 50 ? "var(--call)" : "var(--down)";
  $("borrow").hidden = !(y.broke && y.loansLeft > 0 && s.phase === "trade");
  $("position").textContent = y.broke && y.loansLeft > 0
    ? "Broke. Dad's savings are right there…"
    : y.out
      ? "Wiped out, and Dad's savings are gone. Watch the others until next round."
    : y.pos
      ? `${y.pos.side === 1 ? "LONG" : "SHORT"} at ${y.pos.entry.toFixed(s.digits)}, ${y.pos.leverage}×, margin ${yen(y.pos.margin)}${y.pos.stop ? `, stop ${y.pos.stop.toFixed(s.digits)}` : ", no stop"}`
      : "No position.";
  if (y.debt) $("position").textContent += ` Owed to Dad: ${yen(y.debt)}.`;
  const closed = s.phase !== "trade" || y.out;
  for (const id of ["buy", "sell", "pray"]) $(id).disabled = closed;
  for (const id of ["close", "stop"]) $(id).disabled = closed || !y.pos;
  $("stop").textContent = y.pos?.stop ? "Remove stop" : "Stop at −1%";

  // The forced loss cut: a new stop-out or wipe-out takes the screen.
  if (cuts !== null && y.cuts > cuts) {
    $("losscut-sub").textContent = y.out ? "WIPED OUT · ZERO-CUT" : "FORCED LOSS CUT";
    $("losscut").hidden = false;
    setTimeout(() => ($("losscut").hidden = true), 2200);
  }
  cuts = y.cuts;

  const humans = s.traders.filter((t) => !t.motto).length;
  $("count").textContent = `${humans} human${humans === 1 ? "" : "s"}`;
  const list = $("traders");
  list.replaceChildren(
    ...s.traders.map((t) => {
      const li = document.createElement("li");
      li.className = `${t.you ? "you" : ""} ${t.out ? "out" : ""}`;
      const n = document.createElement("span");
      n.className = "n";
      n.textContent = t.name + (t.you ? " (you)" : "");
      if (t.motto) {
        n.title = t.motto;
        n.insertAdjacentHTML("beforeend", ' <span class="botmark">bot</span>');
      }
      const p = document.createElement("span");
      if (t.side) {
        p.className = `pos ${t.side === 1 ? "long" : "short"}`;
        p.textContent = `${t.side === 1 ? "▲" : "▼"} ${t.leverage}×`;
      }
      const e = document.createElement("span");
      e.textContent = yen(t.equity);
      e.className = t.equity >= s.start ? "up" : "down";
      li.append(n, p, e);
      return li;
    }),
  );
  $("feed").replaceChildren(
    ...s.feed.map((f) => {
      const li = document.createElement("li");
      li.className = f.kind;
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

const events = new EventSource("/api/events");
events.onmessage = (e) => receive(JSON.parse(e.data));
