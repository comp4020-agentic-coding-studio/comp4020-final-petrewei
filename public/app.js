// The trading floor's page. The server owns everything; this page draws
// what it sends and posts the buttons. Elements are updated in place, so a
// click is never lost to a redraw.
const $ = (id) => document.getElementById(id);
import { LANGS, T, money, news, refusal } from "/i18n.js";
import { drawn } from "/names.js";
import { bollinger, closes, rsi, sma, stack } from "/indicators.js";

// The page's language is its address: / English, /ja/ Japanese, /zh/
// Chinese. The server has already written the page in it; the menu moves
// to the same page in another language. The market is not in the address,
// so people reading different languages share the same rooms.
let lang = LANGS.includes(document.documentElement.dataset.lang) ? document.documentElement.dataset.lang : "en";
const home = (l) => (l === "en" ? "/" : `/${l}/`);
// A slot not given here is left as {slot}, for rich() to fill as bold.
const t = (k, vars = {}) => (T[lang].ui[k] ?? T.en.ui[k]).replace(/\{(\w+)\}/g, (slot, v) => (v in vars ? String(vars[v]) : slot));
const yen = (n) => money(lang, n);
// A trader's name in this language: a character's in the page's script,
// a drawn name in this language's form, a typed name as typed. People
// are found by short code.
const botName = (id, fallback) => T[lang].bots[id]?.name ?? fallback;
const nameIn = (name, draw) => (draw ? drawn(lang, draw) : name);
let names = new Map();
const nameOf = (code) => names.get(code) ?? botName(code, code);

// Every fixed string on the page carries data-t (its text), data-t-title
// (its tooltip) or data-t-label (a phone label). Switching language fills
// them again and redraws what the server last sent.
function translate() {
  document.documentElement.lang = lang === "zh" ? "zh-CN" : lang;
  for (const el of document.querySelectorAll("[data-t]")) el.textContent = t(el.dataset.t);
  for (const el of document.querySelectorAll("[data-t-title]")) el.title = t(el.dataset.tTitle);
  for (const el of document.querySelectorAll("[data-t-label]")) el.dataset.label = t(el.dataset.tLabel);
  for (const el of document.querySelectorAll("[data-t-aria]")) el.setAttribute("aria-label", t(el.dataset.tAria));
  $("lang").value = lang;
  $("borrow").textContent = t("borrow", { amount: money(lang, 300_000) });
  document.title = `${t("logo")}${t("titleJoin")}${t("sub")}`;
}
// Another language is another address. The market keeps running and the
// tab is remembered, so the page comes back to the same room.
$("lang").onchange = () => location.assign(home($("lang").value));

let state = null;
// Forced closes seen so far; a new one takes the screen.
let cuts = null;
// The last pop shown, by number; the first message's pops are old news.
let popped = null;
let lastPrice = null;
let fame = "";

// Leverage and stake are chip groups that hold their choice. What each
// leverage means is said beside it, in the parody's voice.
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
  $("lev-note").textContent = T[lang].ui.notes[choice.leverage] ?? "";
}
chips("stake", STAKES, (v) => `${v * 100}%`, "stake");

// The market this page is on, from the tab: kept in this browser, so a
// reload, or a switch of language, returns to it.
const MODES = ["history", "live", "tutorial"];
let mode = (() => {
  try {
    const saved = localStorage.getItem("tab");
    if (MODES.includes(saved)) return saved;
  } catch {
    // no storage: start on History
  }
  return "history";
})();
// Older links named the tab in the address (/#live); honour one once,
// then drop it, so the address names only the language.
if (MODES.includes(location.hash.slice(1))) {
  mode = location.hash.slice(1);
  history.replaceState(null, "", location.pathname);
}

async function act(kind, extra = {}) {
  $("error").textContent = "";
  const res = await fetch("/api/act", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, mode, ...extra }) });
  if (!res.ok) $("error").textContent = refusal(lang, (await res.json()).error ?? "Refused.");
}
const order = (kind) => () => act(kind, { leverage: choice.leverage, stake: choice.stake });
$("buy").onclick = order("buy");
$("sell").onclick = order("sell");
$("close").onclick = () => act("close");
$("pray").onclick = () => {
  burst($("pray"), ["🙏", "✨", "🙏", "⛩️", "✨"]);
  act("pray");
};
$("borrow").onclick = () => act("borrow");
$("lesson-next").onclick = () => act("next");

// Light or dark: the system's choice until the toggle is used, then the
// toggle's, remembered in this browser. The chart reads its colours from
// the theme, so it is redrawn at once.
const dark = matchMedia("(prefers-color-scheme: dark)");
const theme = () => document.documentElement.dataset.theme ?? (dark.matches ? "dark" : "light");
// The button shows the sun in dark mode and the moon in light: what a
// click switches to. Its name, for screen readers and the tooltip, says so.
function label() {
  document.documentElement.dataset.modeShown = theme();
  const name = theme() === "dark" ? t("toLight") : t("toDark");
  $("theme").title = name;
  $("theme").setAttribute("aria-label", name);
}
$("theme").onclick = () => {
  const next = theme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem("theme", next);
  } catch {
    // a private window: the choice lasts this visit
  }
  label();
  if (state) draw(state);
};
dark.addEventListener("change", () => {
  label();
  if (state) draw(state);
});
$("start").onclick = () => act("start");
$("warn-close").onclick = () => act("close");

// The broker's warning. In a margin call (the desk's own flag) a red
// banner says so, with how far the price can move before the forced
// losscut and a button to close; from 70% down, an amber one says a call
// is coming. The margin level pulses, and the tab's title says it too,
// so a trader in another tab sees it. The tutorial's lessons teach the
// call themselves, so it shows no banner.
const NEAR = 70;
function warn(s, open) {
  const pos = s.you.pos;
  const level = s.you.level;
  const calling = !!pos?.called;
  const near = !calling && level !== null && level <= NEAR;
  const show = open && pos && (calling || near) && s.mode !== "tutorial";
  $("warn").hidden = !show;
  $("warn").className = `warn ${calling ? "calling" : "near"}`;
  $("level-box").classList.toggle("alarm", !!(open && calling));
  if (show) {
    // How far the price can move, against you, to the next line.
    const to = calling ? pos.cut : pos.call;
    // At 1000× the losscut can be under 0.005% off: never round it to 0.
    const pct = Math.abs(to / s.prices.at(-1) - 1) * 100;
    const move = `${pct >= 0.1 ? pct.toFixed(2) : pct.toPrecision(2)}%`;
    $("warn-title").textContent = t(calling ? "warnCallTitle" : "warnNearTitle");
    $("warn-text").textContent = t(calling ? "warnCallText" : "warnNearText", { level, move });
  }
  document.title = show && calling ? t("warnTab", { level }) : `${t("logo")}${t("titleJoin")}${t("sub")}`;
}

// Your trader name: type one, or draw one at random until one fits. The
// server says whether it may be used, and every page sees it next
// broadcast; a draw changes nothing until it is saved.
let me = "";
$("whoami").onclick = () => {
  $("name-input").value = me;
  $("name-error").textContent = "";
  $("name-box").showModal();
  $("name-input").select();
};
$("name-cancel").onclick = () => $("name-box").close();
$("name-draw").onclick = async () => {
  const res = await fetch("/api/name");
  if (res.ok) {
    const d = await res.json();
    $("name-input").value = nameIn(d.name, d.draw);
  }
  $("name-error").textContent = "";
  $("name-input").focus();
};
$("name-form").onsubmit = async (e) => {
  e.preventDefault();
  const res = await fetch("/api/name", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: $("name-input").value }) });
  const out = await res.json();
  if (!res.ok) return void ($("name-error").textContent = refusal(lang, out.error ?? "Refused."));
  me = nameIn(out.name, out.draw);
  $("name-box").close();
};

// The lobby: a market waits for someone on the tab to press Start, then
// counts down so others can join.
function lobby(s) {
  const waiting = s.phase === "lobby" || s.phase === "countdown";
  $("lobby").hidden = s.mode === "tutorial" || !waiting;
  if (!waiting) return;
  const counting = s.phase === "countdown";
  $("lobby-title").textContent = counting ? t("lobbyOpens", { s: s.countdown }) : t(s.mode === "live" ? "lobbyLive" : "lobbyHistory");
  $("lobby-text").textContent = counting ? t("lobbyStarted", { who: nameIn(s.startedBy, s.startedDraw) }) : t(s.mode === "live" ? "lobbyLiveText" : "lobbyHistoryText");
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
  // The lesson in this language; in English, as the server sent it.
  const own = T[lang].lessons[l.id] ?? l;
  $("lesson-n").textContent = l.finished ? t("lessonDone") : t("lessonN", { n: l.n, of: l.of });
  $("lesson-title").textContent = l.finished ? t("doneTitle") : own.title;
  $("lesson-text").textContent = l.finished ? t("doneText") : own.text;
  $("lesson-task").textContent = l.finished ? t("doneTask") : moving ? t("watch") : own.task;
  $("lesson-next").hidden = l.finished || moving || !l.next;
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
  $("spread").textContent = t("spread", { pips: ((s.ask - s.bid) / (s.digits === 3 ? 0.01 : 0.0001)).toFixed(1) });
  const free = Math.max(0, s.you.equity - (s.you.pos?.margin ?? 0));
  const margin = Math.floor(free * choice.stake);
  const controls = margin * choice.leverage;
  // At L× leverage, a move of 1/L against you is everything you put in.
  const wipe = 100 / choice.leverage;
  // With a position open, a same-side order adds to it and an opposite
  // one closes it, so the preview says which.
  const pos = s.you.pos;
  const same = pos?.side === 1 ? t("buy") : t("sell");
  const other = pos?.side === 1 ? t("sell") : t("buy");
  const pct = wipe < 1 ? wipe.toFixed(2) : wipe.toFixed(0);
  $("preview").replaceChildren(
    ...rich(
      pos
        ? margin > 0
          ? t("previewAdd", { same, other, lev: choice.leverage })
          : t("previewFull", { other })
        : margin > 0
          ? t("previewOpen", { pct })
          : t("previewNone"),
      { margin: yen(margin), controls: yen(controls) },
    ),
  );
}
const strong = (text) => Object.assign(document.createElement("strong"), { textContent: text });
// Text with {slots} left in it, the slots filled as bold nodes, so a
// translation can put the amounts wherever its grammar wants them.
function rich(text, slots) {
  return text.split(/(\{\w+\})/).map((part) => {
    const k = part.match(/^\{(\w+)\}$/)?.[1];
    return k && k in slots ? strong(slots[k]) : part;
  });
}

// Which indicators are on, remembered in this browser. MA and RSI start
// on, the bands off, so a first chart is not a tangle.
const studies = (() => {
  try {
    return { ma: true, bb: false, rsi: true, ...JSON.parse(localStorage.getItem("studies") ?? "{}") };
  } catch {
    return { ma: true, bb: false, rsi: true };
  }
})();
for (const b of document.querySelectorAll("#studies button")) {
  b.setAttribute("aria-pressed", String(studies[b.dataset.study]));
  b.onclick = () => {
    studies[b.dataset.study] = !studies[b.dataset.study];
    b.setAttribute("aria-pressed", String(studies[b.dataset.study]));
    try {
      localStorage.setItem("studies", JSON.stringify(studies));
    } catch {
      // a private window: the choice lasts this visit
    }
    if (state) draw(state);
  };
}

function draw(s) {
  const canvas = $("chart");
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  // With the RSI on, the price takes the top three quarters and the RSI
  // a pane below; the canvas, and so the layout, keeps its size.
  const pane = studies.rsi && s.mode !== "tutorial" ? 84 : 0;
  const h = canvas.height - pane;
  const css = getComputedStyle(document.documentElement);
  ctx.fillStyle = css.getPropertyValue("--chart");
  ctx.fillRect(0, 0, w, canvas.height);
  const prices = s.prices;
  const k = s.steps;
  // Indicators on each day's close, drawn at the day's centre; the bands
  // widen the price range so they stay on the chart.
  const tutorial = s.mode === "tutorial";
  const days = closes(prices, k);
  const bands = studies.bb && !tutorial ? bollinger(days, 20, 2) : [];
  const shown = bands.filter(Boolean);
  // The stop and the margin lines join the scale when they are near
  // (within 3%, as at 100× and up), so high leverage shows how close the
  // losscut is.
  const pos = s.you.pos;
  const near = pos ? [pos.stop, pos.call, pos.cut].filter((p) => p && Math.abs(p / prices.at(-1) - 1) < 0.03) : [];
  const lo = Math.min(...prices, ...shown.map((b) => b.lower), ...near);
  const hi = Math.max(...prices, ...shown.map((b) => b.upper), ...near);
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
  for (let d = 0; d * k <= s.total; d += 5) {
    const xd = x(d * k);
    ctx.beginPath();
    ctx.moveTo(xd, 0);
    ctx.lineTo(xd, h + pane);
    ctx.stroke();
  }
  // A day's indicator sits at its candle's centre; today's at the price.
  const dayX = (d) => x(Math.min(d * k + k / 2, prices.length - 1));
  const line = (values, colour, width = 1.5) => {
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.beginPath();
    let on = false;
    values.forEach((v, d) => {
      if (v === null) return void (on = false);
      if (on) ctx.lineTo(dayX(d), v);
      else ctx.moveTo(dayX(d), v);
      on = true;
    });
    ctx.stroke();
    ctx.lineWidth = 1;
  };
  for (let k = 0; k <= 4; k++) {
    const p = bottom + ((top - bottom) * k) / 4;
    ctx.beginPath();
    ctx.moveTo(0, y(p));
    ctx.lineTo(w - 70, y(p));
    ctx.stroke();
    // Grid labels that would sit under the last-price tag are skipped.
    if (Math.abs(y(p) - y(prices.at(-1))) > 16) ctx.fillText(p.toFixed(s.digits), w - 66, Math.min(h - (pane ? 8 : 4), Math.max(14, y(p) + 4)));
  }
  // The bands, under everything that follows.
  if (shown.length) {
    ctx.fillStyle = css.getPropertyValue("--band-fill");
    ctx.beginPath();
    const at = bands.map((b, d) => [b, d]).filter(([b]) => b);
    at.forEach(([b, d], i) => (i ? ctx.lineTo(dayX(d), y(b.upper)) : ctx.moveTo(dayX(d), y(b.upper))));
    at.toReversed().forEach(([b, d]) => ctx.lineTo(dayX(d), y(b.lower)));
    ctx.fill();
    line(bands.map((b) => b && y(b.upper)), css.getPropertyValue("--band"), 1);
    line(bands.map((b) => b && y(b.lower)), css.getPropertyValue("--band"), 1);
  }
  // The entry and the stop of my own position.
  // My position's lines: the entry, the stop, and where the broker steps
  // in, the margin call and the forced losscut, worked out by the
  // server's desk. A line off the scale is listed at that edge with an
  // arrow. Labels are laid out top to bottom in their lines' order, each
  // at its line or just below the label above, so lines close together
  // (a 400× position's) never print over each other or swap places.
  const marks = [];
  if (pos) {
    marks.push([pos.entry, pos.side === 1 ? up : down, `${pos.side === 1 ? t("long") : t("short")} ${pos.leverage}×`]);
    if (pos.stop) marks.push([pos.stop, css.getPropertyValue("--call"), t("thStop")]);
    if (pos.call) marks.push([pos.call, css.getPropertyValue("--call"), t("lineCall")], [pos.cut, down, t("lineCut")]);
  }
  const labels = [];
  for (const [p, colour, text] of marks) {
    if (p > bottom && p < top) {
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = colour;
      ctx.beginPath();
      ctx.moveTo(0, y(p));
      ctx.lineTo(w - 70, y(p));
      ctx.stroke();
      ctx.setLineDash([]);
      labels.push({ at: y(p) - 4, colour, text });
    } else labels.push({ at: p >= top ? 0 : h, colour, text: `${p >= top ? "▲" : "▼"} ${text} ${p.toFixed(s.digits)}` });
  }
  // Each label on a patch of the chart's colour, so a line that runs
  // under a pushed-down label never strikes through it.
  for (const l of stack(labels, 44, h - 4, 15)) {
    const lw = ctx.measureText(l.text).width;
    ctx.fillStyle = css.getPropertyValue("--chart");
    ctx.fillRect(w - 70 - lw - 9, l.at - 11, lw + 6, 14);
    ctx.fillStyle = l.colour;
    ctx.fillText(l.text, w - 70 - lw - 6, l.at);
  }
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
  // Moving averages over the candles, and their legend top-left.
  const legend = [];
  if (studies.ma && !tutorial) {
    const fast = sma(days, 5);
    const slow = sma(days, 20);
    line(slow.map((v) => v && y(v)), css.getPropertyValue("--ma-slow"));
    line(fast.map((v) => v && y(v)), css.getPropertyValue("--ma-fast"));
    if (fast.at(-1)) legend.push([`MA5 ${fast.at(-1).toFixed(s.digits)}`, css.getPropertyValue("--ma-fast")]);
    if (slow.at(-1)) legend.push([`MA20 ${slow.at(-1).toFixed(s.digits)}`, css.getPropertyValue("--ma-slow")]);
  }
  if (shown.length) legend.push([`BB(20,2)`, css.getPropertyValue("--band")]);
  // On a phone the canvas is shrunk to a third, too small for a legend.
  const small = canvas.clientWidth < 600;
  let lx = 10;
  for (const [text, colour] of small ? [] : legend) {
    ctx.fillStyle = colour;
    ctx.fillText(text, lx, 18);
    lx += ctx.measureText(text).width + 14;
  }
  // The RSI pane: the line, the 70 and 30 bands, and today's value.
  if (pane) {
    const ry = (v) => h + 8 + ((100 - v) / 100) * (pane - 16);
    ctx.strokeStyle = css.getPropertyValue("--line");
    ctx.beginPath();
    ctx.moveTo(0, h + 0.5);
    ctx.lineTo(w, h + 0.5);
    ctx.stroke();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = css.getPropertyValue("--chart-grid");
    for (const v of [30, 70]) {
      ctx.beginPath();
      ctx.moveTo(0, ry(v));
      ctx.lineTo(w - 70, ry(v));
      ctx.stroke();
      ctx.fillStyle = css.getPropertyValue("--muted");
      ctx.fillText(String(v), w - 66, ry(v) + 4);
    }
    ctx.setLineDash([]);
    const r = rsi(days, 14);
    line(r.map((v) => v === null ? null : ry(v)), css.getPropertyValue("--rsi"));
    const now = r.at(-1);
    ctx.fillStyle = now === null ? css.getPropertyValue("--muted") : now >= 70 ? down : now <= 30 ? up : css.getPropertyValue("--rsi");
    if (!small) ctx.fillText(`RSI(14) ${now === null ? "—" : now.toFixed(1)}`, 10, h + 20);
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

// Effects: speech bubbles over a trader when the room should notice
// them, a burst of emoji on a prayer, coins on a win, and the price
// flashing as it moves. They float in a fixed layer above the page and
// never move its layout; with reduced motion they appear without moving.
const fx = $("fx");
// A pop over a control rises above it; one in the room sits on its row,
// so it never hides the trader above.
function float(el, target, ms, onRow = false) {
  const r = target.getBoundingClientRect();
  if (!r.width || r.bottom < 0 || r.top > innerHeight) return;
  el.style.left = `${Math.min(Math.max(r.left + r.width / 2, 90), innerWidth - 90)}px`;
  el.style.top = `${onRow ? r.top + r.height / 2 : r.top}px`;
  fx.append(el);
  setTimeout(() => el.remove(), ms);
}
function bubble(target, text, kind) {
  const onRow = !!target.closest("#traders");
  const b = Object.assign(document.createElement("div"), { className: `bubble b-${kind}${onRow ? " row" : ""}`, textContent: text });
  float(b, onRow ? target.closest("li") : target, 2600, onRow);
}
function burst(target, glyphs) {
  glyphs.forEach((g, i) => {
    const p = Object.assign(document.createElement("span"), { className: "spark", textContent: g });
    p.style.setProperty("--dx", `${(i - (glyphs.length - 1) / 2) * 26}px`);
    p.style.animationDelay = `${i * 60}ms`;
    float(p, target, 1400);
  });
}
const pick = (list) => list[Math.floor(Math.random() * list.length)];
function popText(p) {
  if (p.kind === "pray") return pick(T[lang].prayers);
  if (p.kind === "close") return `${p.pnl >= 0 ? "+" : ""}${yen(p.pnl)}${p.pnl > 0 ? " 💰" : p.pnl < 0 ? " 💸" : ""}`;
  return (T[lang].pops[p.kind] ?? "").replaceAll("{lev}", String(p.lev ?? ""));
}
// Where a pop shows: over the trader's row in the room, or, for your own,
// over the control you used, since your row may be off screen.
function popAt(p, s) {
  if (p.who === s.you.code) {
    if (p.kind === "pray") return $("pray");
    if (p.kind === "close") return $("pnl-box");
    if (p.kind === "call" || p.kind === "stopout" || p.kind === "zerocut") return $("level-box");
    if (p.kind === "borrow") return $("equity");
    return $(s.you.pos?.side === -1 ? "sell" : "buy");
  }
  return document.querySelector(`#traders li[data-id="${CSS.escape(p.who)}"] .n`);
}
function effects(s, price) {
  const list = s.pops ?? [];
  if (popped !== null) {
    for (const p of list) {
      if (p.n <= popped) continue;
      const at = popAt(p, s);
      if (!at) continue;
      // Your own losscut has the full-screen stamp; a bubble would only cover it.
      if (p.who === s.you.code && (p.kind === "stopout" || p.kind === "zerocut")) continue;
      bubble(at, popText(p), p.kind === "close" ? (p.pnl >= 0 ? "win" : "loss") : p.kind);
      if (p.who === s.you.code && p.kind === "close" && p.pnl > 0) burst(at, ["💴", "💰", "💴", "✨", "💴"]);
    }
  }
  popped = Math.max(popped ?? 0, ...list.map((p) => p.n));
  // The price ticks green or red as it moves.
  if (lastPrice !== null && price !== lastPrice) {
    const el = $("price");
    el.classList.remove("tick-up", "tick-down");
    void el.offsetWidth;
    el.classList.add(price > lastPrice ? "tick-up" : "tick-down");
  }
  lastPrice = price;
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
  // The tab shows a head count as a bare number; its tooltip says what.
  for (const m of ["history", "live"]) {
    $(`here-${m}`).textContent = s.here[m] ? String(s.here[m]) : "";
    $(`here-${m}`).title = s.here[m] ? t(s.here[m] === 1 ? "human" : "humans", { n: s.here[m] }) : "";
  }
  names = new Map(s.traders.map((tr) => [tr.id, tr.bot ? botName(tr.id, tr.name) : nameIn(tr.name, tr.draw)]));
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
  $("mode").textContent = t(tutorial ? "modeTutorial" : s.simulated ? "modeLive" : "modeReplay");
  $("clock").textContent = tutorial
    ? t("clockTutorial")
    : s.phase === "trade"
      ? t("clockDay", { d: Math.max(1, Math.ceil(s.tick / s.steps)), of: s.total / s.steps })
      : s.phase === "countdown"
        ? t("clockOpens", { s: s.countdown })
        : t(s.phase === "lobby" ? "clockLobby" : "clockClosed");
  // Built from text nodes: the name comes from the server, never as HTML.
  // A pencil says it can be changed.
  me = nameIn(s.you.name, s.you.draw);
  $("whoami").replaceChildren(`${t("youAre")} `, strong(me), " ", Object.assign(document.createElement("code"), { textContent: s.you.code }), Object.assign(document.createElement("span"), { className: "pencil", textContent: "✎", ariaHidden: "true" }));
  $("whoami").title = t("youAreTitle");
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
  warn(s, open);
  // Your position: one row with its own close and stop, as on any
  // platform, or a line saying what to do when there is none.
  $("pos-row").hidden = !y.pos;
  $("pos-empty").hidden = !!y.pos;
  if (y.pos) {
    const side = Object.assign(document.createElement("span"), { className: `tag ${y.pos.side === 1 ? "long" : "short"}`, textContent: y.pos.side === 1 ? t("long") : t("short") });
    $("pos-side").replaceChildren(side, ` ${s.pair} ${y.pos.leverage}×`);
    $("pos-entry").textContent = y.pos.entry.toFixed(s.digits);
    $("pos-now").textContent = price.toFixed(s.digits);
    $("pos-margin").textContent = yen(y.pos.margin);
    $("pos-pnl").textContent = yen(y.pnl);
    $("pos-pnl").className = y.pnl > 0 ? "up" : y.pnl < 0 ? "down" : "";
    $("stop").textContent = y.pos.stop ? `${y.pos.stop.toFixed(s.digits)} ✕` : t("addStop");
    $("stop").title = y.pos.stop ? t("removeStopTitle") : t("addStopTitle");
  } else {
    $("position").textContent = t(y.broke && y.loansLeft > 0 ? "broke" : y.out ? "wiped" : open ? "noPos" : "noPosClosed");
  }
  if (y.debt) $("position").textContent += t("owe", { amount: yen(y.debt) });
  const closed = !open || y.out;
  for (const id of ["buy", "sell", "pray"]) $(id).disabled = closed;
  for (const id of ["close", "stop"]) $(id).disabled = closed || !y.pos;

  // The forced loss cut: a new stop-out or wipe-out takes the screen.
  if (cuts !== null && y.cuts > cuts) {
    $("losscut-sub").textContent = t(y.out ? "zerocut" : "losscut");
    // The stamp is the parody's catchphrase: Japanese in Japanese and
    // English, as the comic says it; in Chinese, what Chinese traders say.
    $("losscut-big").textContent = lang === "zh" ? "强制平仓！" : "強制ロスカット";
    $("losscut-big").lang = lang === "zh" ? "zh-CN" : "ja";
    $("losscut").hidden = false;
    setTimeout(() => ($("losscut").hidden = true), 2200);
  }
  cuts = y.cuts;

  const humans = s.traders.filter((t) => !t.bot).length;
  $("count").textContent = t(humans === 1 ? "human" : "humans", { n: humans });
  const list = $("traders");
  list.replaceChildren(
    ...s.traders.map((tr) => {
      const li = document.createElement("li");
      li.className = `${tr.you ? "you" : ""} ${tr.out ? "out" : ""}`;
      const n = document.createElement("span");
      n.className = "n";
      n.textContent = names.get(tr.id) + (tr.you ? ` ${t("youTag")}` : "");
      if (tr.bot) {
        n.title = T[lang].bots[tr.id]?.motto ?? tr.motto ?? "";
        n.append(" ", Object.assign(document.createElement("span"), { className: "botmark", textContent: t("bot") }));
      }
      const p = document.createElement("span");
      if (tr.side) {
        p.className = `pos ${tr.side === 1 ? "long" : "short"}`;
        p.textContent = `${tr.side === 1 ? "▲" : "▼"} ${tr.leverage}×`;
      }
      const e = document.createElement("span");
      e.textContent = yen(tr.equity);
      e.className = `eq ${tr.equity >= s.start ? "up" : "down"}`;
      li.dataset.id = tr.id;
      li.append(n, p, e);
      return li;
    }),
  );
  effects(s, price);
  $("feed").replaceChildren(
    ...s.feed.map((f) => {
      const li = document.createElement("li");
      li.className = `k-${f.kind}`;
      li.textContent = news(lang, f, nameOf);
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
        for (const v of [nameIn(c.name, c.draw), c.rounds, yen(c.profit), c.wins, c.busts]) {
          const td = document.createElement("td");
          td.textContent = v;
          tr.append(td);
        }
        return tr;
      }),
    );
  }


  // After the bell the result stands in for the ticket, at its height.
  const bell = s.phase === "break" && !!s.result;
  if (bell && $("bell").hidden) $("bell").style.height = `${document.querySelector(".ticket").offsetHeight}px`;
  $("bell").hidden = !bell;
  document.body.classList.toggle("bell-up", bell);
  if (s.result) {
    $("reveal").textContent = reveal(s.result);
    $("bell-next").textContent = t("bellNext", { s: s.breakLeft });
    $("ranking").replaceChildren(
      ...s.result.ranking.map((r) => {
        const li = document.createElement("li");
        if (r.you) li.className = "you";
        // Rank, name and result on one row, as a column this narrow can hold.
        const delta = r.balance - s.start;
        const name = Object.assign(document.createElement("span"), { className: "who", textContent: `${botName(r.code, nameIn(r.name, r.draw))}${r.you ? ` ${t("youTag")}` : ""}` });
        const result = Object.assign(document.createElement("span"), { className: `res ${delta >= 0 ? "up" : "down"}`, textContent: `${delta >= 0 ? "+" : ""}${yen(delta)}` });
        result.title = yen(r.balance);
        li.append(name, result);
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
  try {
    localStorage.setItem("tab", mode);
  } catch {
    // a private window: the tab lasts this visit
  }
  for (const tab of document.querySelectorAll("[role=tab]")) tab.setAttribute("aria-selected", String(tab.dataset.mode === mode));
  events?.close();
  shown = null;
  cuts = null;
  $("error").textContent = "";
  events = new EventSource(`/api/events?mode=${mode}`);
  events.onmessage = (e) => receive(JSON.parse(e.data));
}
for (const tab of document.querySelectorAll("[role=tab]")) tab.onclick = () => tab.dataset.mode !== mode && watch(tab.dataset.mode);
translate();
label();
watch(mode);

// The bell's reveal in this language: the pair and dates, then the
// famous day hidden in it, if any. English is the server's own sentence.
function reveal(result) {
  if (lang === "en") return result.reveal;
  const f = result.facts;
  if (f.simulated) return t("revealSim", { pair: f.pair, date: f.from });
  const said = t("revealReplay", { pair: f.pair, from: f.from, to: f.to });
  const e = f.event && T[lang].events[f.event.date];
  return e ? `${said} ${e.title}（${f.event.date}）：${e.note}` : said;
}
