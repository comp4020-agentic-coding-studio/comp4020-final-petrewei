// The trading floor's page. The server owns everything; this page draws
// what it sends and posts the buttons. Elements are updated in place, so a
// click is never lost to a redraw.
const $ = (id) => document.getElementById(id);
import { LANGS, T, clueText, money, news, refusal } from "/i18n.js";
import { drawn } from "/names.js";
import { PEOPLE, svg } from "/avatars.js";
import { PERIODS, bollinger, closes, rsi, sma, spanIn, spanOf, stack } from "/indicators.js";
import { place, windowed } from "/view.js";
import { STAKES, exitAt, exitPos, feePerMinute, fillSpan, gauge, hue, levAt, levHeat, levPos, moveYen, pct, stakeBar, stakeMargin } from "/ticket.js";
import { ICONS, prop } from "/art.js";
import { clauses } from "/clauses.js";
import { quoted } from "/format.js";
import { autoMove, currentStep as planStep } from "/plan.js";
import { refresh as retip, useClauses, useInfo, useWords } from "/tips.js";

// The page's language is its address: / English, /ja/ Japanese, /zh/
// Chinese. The server has already written the page in it; the menu moves
// to the same page in another language. The market is not in the address,
// so people reading different languages share the same rooms.
let lang = LANGS.includes(document.documentElement.dataset.lang) ? document.documentElement.dataset.lang : "en";
const home = (l) => (l === "en" ? "/" : `/${l}/`);
// A slot not given here is left as {slot}, for rich() to fill as bold.
const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (slot, v) => (v in vars ? String(vars[v]) : slot));
const t = (k, vars = {}) => fill(T[lang].ui[k] ?? T.en.ui[k], vars);
const yen = (n) => money(lang, n);
// A score, signed as a percentage is: a true minus, so the two line up.
const pts = (n) => t("points", { n: `${n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}` });
// A trader's name in this language: a character's in the page's script,
// a drawn name in this language's form, a typed name as typed. People
// are found by short code.
const botName = (id, fallback) => T[lang].bots[id]?.name ?? fallback;
const nameIn = (name, draw) => (typeof draw === "number" ? drawn(lang, draw) : name);
// A tip in this language, by key (ADR 0025).
// the indicators' periods are slots in their tips, so what a tip says is what is drawn (indicators.js)
// Candles in a day, from a market state; the chart's labels and the tips both say spans by it. Before the first state
// a tip says its span in candles, which is true whatever the clock.
const perDay = (s) => (s ? s.dayTicks / s.steps : Infinity);
const tip = (k, vars = {}) => fill(T[lang].tips[k] ?? T.en.tips[k] ?? "", { fast: spanIn(lang, PERIODS.fast, perDay(state)), slow: spanIn(lang, PERIODS.slow, perDay(state)), band: spanIn(lang, PERIODS.band, perDay(state)), ...vars });
useWords((k) => tip(k));
useClauses(clauses);
// What an info button explains (ADR 0049), in this language, by key.
useInfo((k) => T[lang].info[k] ?? T.en.info[k] ?? "");
// A tip that carries values, written only when it changes, since render
// runs twice a second.
const setTip = (el, text) => {
  if (el.dataset.tipText !== text) el.dataset.tipText = text;
};
// A trader's pixel face (ADR 0021), by the name the server gives it. The
// SVG is built from the page's own drawings; the name only picks one.
const avatar = (face, size = 20) => Object.assign(document.createElement("span"), { className: "av", innerHTML: svg(face, size) });
let names = new Map();
// What a room row is, and the badge and word that say so in place of text.
const ROWS = { bot: { badge: "🤖", label: "bot" }, wiped: { badge: "💀", label: "wipedTag" }, person: {} };
const nameOf = (code) => names.get(code) ?? botName(code, code);

// Every fixed string on the page carries data-t (its text), data-t-title
// (its tooltip) or data-t-label (a phone label). Switching language fills
// them again and redraws what the server last sent.
function translate() {
  document.documentElement.lang = lang === "zh" ? "zh-CN" : lang;
  for (const el of document.querySelectorAll("[data-t]")) el.textContent = t(el.dataset.t);
  for (const el of document.querySelectorAll("[data-t-label]")) el.dataset.label = t(el.dataset.tLabel);
  if (ladder.length) sliders();
  for (const el of document.querySelectorAll("[data-t-aria]")) el.setAttribute("aria-label", t(el.dataset.tAria));
  $("lang").value = $("n-lang").value = lang;
  $("borrow").replaceChildren(Object.assign(document.createElement("span"), { className: "art", innerHTML: prop("piggy", 22) }), t("borrow", { amount: money(lang, broker.step) }));
  // the row's button is the step alone, signed, to keep the row on one line; its name and tip say it borrows
  $("credit-borrow").textContent = `+${money(lang, broker.step)}`;
  $("credit-borrow").setAttribute("aria-label", t("borrow", { amount: money(lang, broker.step) }));
  if (state?.lesson) lesson(state);
  retip();
  document.title = `${t("logo")}${t("titleJoin")}${t("sub")}`;
}
// Another language is another address. The market keeps running and the
// tab is remembered, so the page comes back to the same room.
for (const id of ["lang", "n-lang"]) $(id).onchange = () => location.assign(home($(id).value));

let state = null;
let fresh = false;
let connectionStatus = "connectionConnecting";
let heardAt = Date.now();
let connectionTimer = null;
const marketControls = ["buy", "sell", "pend-place", "pend-cancel", "pend-row-cancel", "close", "mobile-close", "warn-close", "psl-on", "ptp-on", "psl-dist", "ptp-dist", "start", "cancel", "pause", "resume", "finish", "hold", "dismiss", "borrow", "credit-borrow", "credit-repay", "pray-rise", "pray-fall", "replay-pair", "pair-base", "pair-quote", "guess-year", "lesson-play", "lesson-stop", "lesson-skip", "lesson-back"];
function blockStaleControls() {
  if (!fresh) {
    for (const id of marketControls) $(id).disabled = true;
    $("guess").querySelector("button[type=submit]").disabled = true;
  }
}
function connection(status) {
  clearTimeout(connectionTimer);
  connectionStatus = status;
  fresh = status === "connectionRestored";
  $("connection").textContent = t(status);
  $("connection").hidden = false;
  $("connection").classList.toggle("restored", fresh);
  // Notices never occupy a row, and disappear even while still offline.
  // The account remains blocked independently until fresh data arrives.
  connectionTimer = setTimeout(() => ($("connection").hidden = true), 1000);
  // Phase-specific restrictions are applied immediately by render().
  if (fresh) for (const id of marketControls) $(id).disabled = false;
  else blockStaleControls();
}
// Forced closes seen so far; a new one takes the screen.
let cuts = null;
// Loans Dad has found out about, as last seen; null before the first state.
let bankrupt = null;
// The last pop shown, by number; the first message's pops are old news.
let popped = null;
let lastPrice = null;
let fame = "";
// whose recent rounds the hall's chart shows: picked in the table, else yourself, else the leader
let famePick = null;
const SVG = "http://www.w3.org/2000/svg";
const svgEl = (tag, attrs) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};
// A trader's recent round scores as a small line around zero, for the table.
function spark(scores) {
  const el = svgEl("svg", { class: "spark", viewBox: "0 0 60 18", "aria-hidden": "true" });
  if (scores.length < 2) return el;
  const top = Math.max(1, ...scores.map(Math.abs));
  const y = (v) => 9 - (v / top) * 8;
  el.append(svgEl("line", { x1: 0, x2: 60, y1: 9, y2: 9, class: "zero" }));
  const points = scores.map((v, i) => `${((i / (scores.length - 1)) * 60).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  el.append(svgEl("polyline", { points, class: scores.at(-1) >= 0 ? "up" : "down" }));
  return el;
}
// The chosen trader's recent rounds as bars up and down from zero, with what they add up to.
function fameChart(s) {
  const c = s.career.find((r) => r.name + (r.draw ?? "") === famePick) ?? s.career.find((r) => r.you) ?? s.career[0];
  $("fame-chart").hidden = !c || !c.recent.length;
  if (!c || !c.recent.length) return;
  const scores = c.recent;
  const top = Math.max(1, ...scores.map(Math.abs));
  const w = 400 / Math.max(scores.length, 10);
  const bars = scores.map((v, i) => {
    const h = (Math.abs(v) / top) * 56;
    const bar = svgEl("rect", { x: i * w + w * 0.15, width: w * 0.7, y: v >= 0 ? 60 - h : 60, height: Math.max(h, 0.8), class: v >= 0 ? "up" : "down" });
    bar.append(Object.assign(svgEl("title", {}), { textContent: pts(v) }));
    return bar;
  });
  $("fame-bars").replaceChildren(svgEl("line", { x1: 0, x2: 400, y1: 60, y2: 60, class: "zero" }), ...bars);
  const name = nameIn(c.name, c.draw);
  $("fame-bars").setAttribute("aria-label", t("fameChart", { name }));
  $("fame-chart-title").textContent = t("fameChart", { name });
  $("fame-stats").textContent = t("fameStats", { n: scores.length, up: scores.filter((v) => v > 0).length, down: scores.filter((v) => v < 0).length, best: pts(Math.max(...scores)), worst: pts(Math.min(...scores)) });
  for (const tr of $("career").children) tr.classList.toggle("picked", s.career[tr.sectionRowIndex] === c);
}

// Leverage and stake are sliders that hold their choice (ADR 0024).
// Leverage runs on a log scale and snaps to the desk's ladder, its ends
// and the two legal caps marked; stake runs evenly. What a leverage means
// is said beside it, in the parody's voice.
const choice = { leverage: 30, stake: 1 };
let seated = false;
// The desk's rules, set by the first state: the ladder, the legal cap, the fee and the
// amount Dad's savings offer, so the page keeps no copy of them.
let ladder = [];
let broker = { cap: 1, fee: 0, step: 0, limit: 0, tiers: [[null, 0]], ticksPerMinute: 120, distances: [1] };
// A scale's marks, each at its place on the track, with the joke it carries on hover.
function ticks(id, marks) {
  $(id).replaceChildren(
    ...marks.map(([at, text, cls = "", joke = ""]) => {
      const m = Object.assign(document.createElement("span"), { className: cls, textContent: text });
      m.style.left = `${at * 100}%`;
      if (joke) m.dataset.tipText = joke;
      return m;
    }),
  );
}
function sliders() {
  // A native step is one offered rung, for both pointer and keyboard input.
  $("leverage").max = String(ladder.length - 1);
  $("leverage").disabled = ladder.length < 2;
  // Every rung of the ladder is marked on the track, the one chosen lit, so a
  // rung is easy to find; Australia's cap is said in the note, not here (ADR 0058).
  const ui = T[lang].ui;
  ticks("lev-ticks", ladder.map((v) => [levPos(v, ladder), `${v}`, `rung-${v}`, ui.notes[v]]));
  // each stake marked at its share of the account, the scale the track's bar is drawn on (ADR 0077)
  ticks("stake-ticks", STAKES.map((v, i) => [v, `${v * 100}%`, "", ui.stakeNotes[i]]));
  // The six distances, once for the stop loss on the left of the track and once for the
  // take profit on the right, each rung's number under its place on the track (ADR 0064).
  const marks = broker.distances.flatMap((d) => ["sl", "tp"].map((kind) => [exitPos({ kind, dist: d }, broker.distances), `${d}`, "", ui[`${kind}Notes`][d]]));
  // On the ticket the track sits between its two switches and is short, so it names only the nearest, a middle and the
  // farthest distance; every rung is still a place its thumb snaps to, and the switch beside it shows the one chosen.
  const named = new Set([broker.distances[0], 5, broker.distances.at(-1)].map(String));
  ticks("exit-ticks", marks.map((m) => (named.has(m[1]) ? m : [m[0], "", m[2], m[3]])));
  ticks("pexit-ticks", marks);
}
function mark() {
  $("leverage").value = String(ladder.indexOf(choice.leverage));
  $("stake").value = String(STAKES.indexOf(choice.stake));
  $("lev-out").textContent = `${choice.leverage}×`;
  $("stake-out").textContent = `${choice.stake * 100}%`;
  // A leverage over the cap says so in the note's colour too, and the page
  // marks the box, so a style can tell a legal choice from an offshore one.
  $("leverage-box").style.setProperty("--heat", hue(levHeat(choice.leverage, broker.cap, ladder.at(-1))));
  $("leverage-box").classList.toggle("offshore", choice.leverage > broker.cap);
  $("stake-box").style.setProperty("--heat", hue(0.1 + 0.55 * ((STAKES.indexOf(choice.stake) + 1) / STAKES.length)));
  $("leverage").setAttribute("aria-valuetext", `${choice.leverage}×`);
  $("stake").setAttribute("aria-valuetext", `${choice.stake * 100}%`);

  for (const el of $("lev-ticks").children) el.classList.toggle("on", el.classList.contains(`rung-${choice.leverage}`));
  for (const [i, el] of [...$("stake-ticks").children].entries()) el.classList.toggle("on", i === STAKES.indexOf(choice.stake));
  // The financing fee grows with the square of the leverage (ADR 0058).
  $("fee-note").textContent = t("carryRate", { pct: feePerMinute(broker.fee, choice.leverage, broker.ticksPerMinute) });
  // The lit step moves on the moment a slider reaches the value it was asked for.
  if (state?.lesson) spotlight(state.lesson, state.phase === "moving");
}
$("leverage").oninput = () => {
  choice.leverage = ladder[Number($("leverage").value)];
  mark();
  if (state) (ticket(state), pending(state));
};
// Let go, and the thumb settles on the rung it chose.
$("leverage").onchange = mark;
$("stake").oninput = () => {
  choice.stake = STAKES[Number($("stake").value)];
  mark();
  if (state) (ticket(state), pending(state));
};
// The pixel props (ADR 0025), drawn once: they never change.
$("bell-art").innerHTML = prop("bell", 26);
$("paused-art").innerHTML = prop("pause", 64);
$("losscut-art").innerHTML = prop("skull", 72);
$("ironman-fist").innerHTML = prop("fist", 20);

// The market this page is on, from the tab: kept in this browser, so a
// reload, or a switch of language, returns to it.
const MODES = ["replay", "simulation", "tutorial"];
// The tabs' old names, History, Live and Scenario, still lead to them (ADRs
// 0027, 0028, 0047).
const renamed = (m) => ({ history: "replay", live: "simulation", scenario: "simulation" })[m] ?? m;
let mode = (() => {
  try {
    // the tabs were called History and Live; a browser that remembers either
    // lands on its new name
    const saved = renamed(localStorage.getItem("tab"));
    if (MODES.includes(saved)) return saved;
  } catch {
    // no storage: start on Replay
  }
  return "replay";
})();
// An address may name a tab (/#simulation, or an old /#history or /#scenario); honour it,
// then drop it, so the address names only the language. Called on load,
// before the page connects, and on every hash change after.
let connected = false;
function fromAddress() {
  // A tab named in the address: open it, whether on load or typed in later.
  const named = renamed(location.hash.slice(1));
  if (!MODES.includes(named)) return;
  history.replaceState(null, "", location.pathname + location.search);
  if (!connected) mode = named;
  else if (named !== mode) watch(named);
}
fromAddress();
addEventListener("hashchange", fromAddress);
// ?debug=… has done its work by the time the page runs (the server set
// or cleared the cookie), so it leaves the address: the operator's key
// is never left in the bar, a bookmark or the history.
if (new URLSearchParams(location.search).has("debug")) history.replaceState(null, "", location.pathname + location.hash);

// A JSON post, answered with the response and what it said; a refusal's words are
// the server's English, which `refusal` puts in this page's language.
async function post(url, body) {
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const out = await res.json();
    return { ok: res.ok, out, why: res.ok ? "" : refusal(lang, out.error ?? "Refused.") };
  } catch {
    // The server may have received the action even if its reply was lost.
    // Never repeat it automatically: the next state shows what landed.
    return { ok: false, out: {}, why: t("requestUncertain") };
  }
}
async function act(kind, extra = {}) {
  if (!fresh) {
    $("error").textContent = t(connectionStatus);
    return;
  }
  $("error").textContent = "";
  const source = events;
  const reply = await post("/api/act", { kind, mode, ...extra });
  if (source === events) $("error").textContent = reply.why;
}
// A stop loss and a take profit each ride on the order when their own
// toggle is on (ADR 0032, 0034); off, each is still shown, grey, and not sent.
const exits = { sl: { on: false, dist: 5 }, tp: { on: false, dist: 10 } };
const order = (kind) => () => act(kind, { leverage: choice.leverage, stake: choice.stake, sl: exits.sl.on ? exits.sl.dist : null, tp: exits.tp.on ? exits.tp.dist : null });
$("buy").onclick = order("buy");
$("sell").onclick = order("sell");
$("close").onclick = () => act("close");
$("mobile-close").onclick = () => act("close");
// A pending order (ADR 0078): this ticket's order, placed later at a level. The page keeps which side, which way and
// how far; the server sets the level from its price and sends back what waits.
// The pending order being set (ADR 0079): a side and a typed level, null until one is typed. Which side of the price the
// level sits on names it, as the server will when it is placed.
const pend = { side: 1, at: null };
// whether the desk takes orders now, set with each state, so typing a level enables Place only then
let deskClosed = true;
const pendType = (side, at, price) => `${side === 1 ? "buy" : "sell"}-${(side === 1) === at < price ? "limit" : "stop"}`;
function segment(id, key, value) {
  for (const b of $(id).querySelectorAll("[role=radio]")) b.setAttribute("aria-checked", String(Number(b.dataset[key]) === value));
}
$("pend-side").onclick = (e) => {
  const b = e.target.closest("[role=radio]");
  if (!b) return;
  pend.side = Number(b.dataset.side);
  segment("pend-side", "side", pend.side);
  if (state) pending(state);
};
$("pend-at").oninput = () => {
  const v = Number($("pend-at").value);
  pend.at = $("pend-at").value !== "" && v > 0 ? v : null;
  if (state) pending(state);
};
// opening the section starts the level at the price now, to be typed over
$("pend").ontoggle = () => {
  if ($("pend").open && pend.at === null && state) {
    $("pend-at").value = quoted(state.prices.at(-1));
    pend.at = Number($("pend-at").value);
    pending(state);
  }
};
$("pend-place").onclick = () => act("pend", { side: pend.side, at: pend.at, leverage: choice.leverage, stake: choice.stake, sl: exits.sl.on ? exits.sl.dist : null, tp: exits.tp.on ? exits.tp.dist : null });
$("pend-cancel").onclick = $("pend-row-cancel").onclick = () => act("unpend");
// A round's controls (ADR 0022). Ending for everyone asks first.
$("cancel").onclick = () => act("cancel");
$("pause").onclick = () => act("pause");
// A panel with a heading folds to it: click or press Enter on the heading.
// The folded panels are remembered in this browser (ADR 0039).
const folded = (() => {
  try {
    return new Set(JSON.parse(localStorage.getItem("folded") ?? "[]"));
  } catch {
    return new Set();
  }
})();
for (const panel of document.querySelectorAll(".panel[data-fold]")) {
  const head = panel.querySelector(":scope > h2");
  const fold = (on) => {
    panel.classList.toggle("folded", on);
    head.setAttribute("aria-expanded", String(!on));
    on ? folded.add(panel.dataset.fold) : folded.delete(panel.dataset.fold);
    try {
      localStorage.setItem("folded", JSON.stringify([...folded]));
    } catch {
      // a private window: the fold lasts this visit
    }
  };
  head.setAttribute("role", "button");
  head.tabIndex = 0;
  head.setAttribute("aria-expanded", "true");
  panel.classList.toggle("folded", folded.has(panel.dataset.fold));
  head.setAttribute("aria-expanded", String(!folded.has(panel.dataset.fold)));
  head.onclick = () => fold(!panel.classList.contains("folded"));
  head.onkeydown = (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), head.click());
}
// Name that year: one private guess, which may be changed until the bell.
$("guess-year").max = String(new Date().getFullYear());
$("guess").onsubmit = (e) => {
  e.preventDefault();
  act("guess", { year: Number($("guess-year").value) });
};
$("resume").onclick = () => act("resume");
$("finish").onclick = () => confirm(t("finishConfirm")) && act("finish");
$("hold").onclick = () => act("hold");
$("dismiss").onclick = () => act("dismiss");
// Two prayers, for a rise and for a fall; neither does anything (ADR 0064).
for (const [id, way, emoji] of [["pray-rise", 1, "🚀"], ["pray-fall", -1, "📉"]]) {
  $(id).onclick = () => {
    burst($(id), ["🙏", "✨", "🙏", emoji, "✨"]);
    act("pray", { way });
  };
}
// The daily rate on a debt, by the broker's tiers (ADR 0080); an upper bound of null is the last tier.
const creditRate = (debt) => (broker.tiers.find(([upTo]) => upTo === null || debt <= upTo) ?? broker.tiers.at(-1))[1];
const ratePct = (r) => `${+(r * 100).toFixed(2)}%`;
// Emergency credit is drawn from its row any time, or from a pop-up once a player is cut out or broke, which closes
// once it is (ADR 0080).
$("credit-borrow").onclick = () => act("borrow");
$("credit-repay").onclick = () => act("repay");
$("borrow").onclick = () => {
  act("borrow");
  dadAsked = true;
  $("dad").close();
};
$("dad-no").onclick = () => {
  dadAsked = true;
  $("dad").close();
};
let dadAsked = false;

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
  for (const id of ["theme", "n-theme"]) {
    $(id).dataset.tip = theme() === "dark" ? "toLight" : "toDark";
    $(id).setAttribute("aria-label", name);
  }
}
const switchTheme = () => {
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
$("theme").onclick = $("n-theme").onclick = switchTheme;
dark.addEventListener("change", () => {
  label();
  if (state) draw(state);
});
// Ironman is a switch: on, nobody can pause the round it starts.
let ironman = false;
$("ironman").onclick = () => $("ironman").setAttribute("aria-checked", String((ironman = !ironman)));
$("start").onclick = () => act("start", { ironman });

// Optional background music (ADR 0020): off until the player turns it on,
// and only then is the track fetched. The choice is remembered, but a
// browser lets sound start only from a click, so a returning player who
// left it on hears it from their first click anywhere on the page.
const bgm = $("bgm");
bgm.volume = 0.35;
const musicLabel = () => {
  const on = !bgm.paused;
  for (const id of ["music", "n-music"]) {
    $(id).setAttribute("aria-pressed", String(on));
    $(id).dataset.tip = on ? "musicOff" : "musicOn";
    $(id).setAttribute("aria-label", t(on ? "musicOff" : "musicOn"));
  }
};
const remember = (on) => {
  try {
    localStorage.setItem("music", on ? "on" : "off");
  } catch {
    // a private window: the choice lasts this visit
  }
};
const toggleMusic = async () => {
  if (bgm.paused) {
    try {
      await bgm.play();
      remember(true);
    } catch {
      // the browser refused; the button stays off
    }
  } else {
    bgm.pause();
    remember(false);
  }
  musicLabel();
};
$("music").onclick = $("n-music").onclick = toggleMusic;
bgm.addEventListener("play", musicLabel);
bgm.addEventListener("pause", musicLabel);
try {
  if (localStorage.getItem("music") === "on") {
    addEventListener("pointerdown", function resume(e) {
      removeEventListener("pointerdown", resume, true);
      if (bgm.paused && !e.target.closest?.("#music, #n-music")) bgm.play().catch(() => {});
    }, true);
  }
} catch {
  // no storage: music stays off
}
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
    const gap = Math.abs(to / s.prices.at(-1) - 1) * 100;
    const move = `${gap >= 0.1 ? gap.toFixed(2) : gap.toPrecision(2)}%`;
    $("warn-title").textContent = t(calling ? "warnCallTitle" : "warnNearTitle");
    $("warn-text").textContent = t(calling ? "warnCallText" : "warnNearText", { level, move });
  }
  document.title = show && calling ? t("warnTab", { level }) : `${t("logo")}${t("titleJoin")}${t("sub")}`;
}

// Your trader name: type one, or draw one at random until one fits, and
// your face: click it for another of the plain set (ADR 0021). The server
// says whether they may be used, and every page sees them next
// broadcast; a draw changes nothing until it is saved.
let me = "";
let myFace = "p0";
let tryFace = myFace;
const showFace = () => ($("face-draw").innerHTML = svg(tryFace, 28));
$("face-draw").onclick = () => {
  const others = PEOPLE.map((_, i) => `p${i}`).filter((f) => f !== tryFace);
  tryFace = others[Math.floor(Math.random() * others.length)];
  showFace();
};
// A newcomer, with no record on the server, meets this box on arrival and
// chooses where to begin; a returning player opens it to rename (ADR 0038).
let welcomed = false;
function openNames(first) {
  tryFace = myFace;
  showFace();
  $("name-input").value = me;
  $("name-error").textContent = "";
  $("name-box").dataset.first = String(first);
  $("name-row").hidden = first;
  $("name-first").hidden = !first;
  $("name-title").textContent = t(first ? "nameWelcome" : "nameTitle");
  if (!$("name-box").open) $("name-box").showModal();
  $("name-input").select();
}
$("whoami").onclick = () => openNames(false);
$("name-cancel").onclick = () => $("name-box").close();
// A newcomer cannot dismiss the box by Escape: they begin from it.
$("name-box").addEventListener("cancel", (e) => $("name-box").dataset.first === "true" && e.preventDefault());
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
  if (tryFace !== myFace) {
    const done = await post("/api/face", { face: tryFace });
    if (!done.ok) return void ($("name-error").textContent = done.why);
    myFace = done.out.face;
  }
  const saved = await post("/api/name", { name: $("name-input").value });
  if (!saved.ok) return void ($("name-error").textContent = saved.why);
  me = nameIn(saved.out.name, saved.out.draw);
  const begin = e.submitter?.value;
  $("name-box").close();
  if (begin && begin !== mode) watch(begin);
};

// The lobby: a market waits for someone on the tab to press Start, then
// counts down so others can join and place an order at the open; whoever
// pressed Start may cancel it.
function lobby(s) {
  const waiting = s.phase === "lobby" || s.phase === "countdown";
  $("lobby").hidden = s.mode === "tutorial" || !waiting;
  if (!waiting) return;
  const counting = s.phase === "countdown";
  $("lobby").classList.toggle("counting", counting);
  $("cancel").hidden = !(counting && s.rules);
  $("ironman").hidden = counting;
  $("lobby-title").textContent = counting ? String(s.countdown) : t(s.mode === "simulation" ? "lobbySimulation" : "lobbyReplay");
  $("lobby-text").textContent = counting ? t("lobbyCounting", { who: nameIn(s.startedBy, s.startedDraw) }) : t(s.mode === "simulation" ? "lobbySimulationText" : "lobbyReplayText");
  $("start").hidden = counting;
}
// Round selection stays beside the quoted pair. Menus use only the pairs
// the server offers, and a base change keeps the quote when it is supported.
function options(id, values, selected) {
  const sel = $(id);
  const rebuilt = JSON.stringify([...sel.options].map((o) => o.value)) !== JSON.stringify(values);
  if (rebuilt) sel.replaceChildren(...values.map((value) => Object.assign(document.createElement("option"), { value, textContent: value })));
  // A menu being used keeps its value; the state catches up when it is let go.
  if (rebuilt || document.activeElement !== sel) sel.value = selected;
}
function pairChoices(s) {
  const simulation = s.mode === "simulation";
  $("pair").hidden = simulation || s.mode === "replay";
  $("pair-controls").hidden = !simulation;
  $("replay-pair").hidden = s.mode !== "replay";
  const closed = s.phase !== "lobby" || !fresh;
  for (const id of ["replay-pair", "pair-base", "pair-quote"]) $(id).disabled = closed;
  if (s.replayPlots) {
    const sel = $("replay-pair");
    if (sel.options.length !== s.replayPlots.length) sel.replaceChildren(...s.replayPlots.map((p) => Object.assign(document.createElement("option"), { value: String(p.n), textContent: `${p.pair} · ${String(p.n).padStart(2, "0")}` })));
    if (document.activeElement !== sel) sel.value = String(s.replayPlot);
  }
  if (simulation && s.pairs) {
    const [base, quote] = s.pair.split("/");
    options("pair-base", [...new Set(s.pairs.map((p) => p.split("/")[0]))], base);
    options("pair-quote", s.pairs.filter((p) => p.startsWith(`${base}/`)).map((p) => p.split("/")[1]), quote);
  }
}
$("replay-pair").onchange = async () => {
  await act("choose", { what: Number($("replay-pair").value) });
  if (state) pairChoices(state);
};
async function choosePair() {
  const offered = state?.pairs?.filter((p) => p.startsWith(`${$("pair-base").value}/`)) ?? [];
  const pair = offered.find((p) => p.endsWith(`/${$("pair-quote").value}`)) ?? offered[0];
  if (!pair) return;
  options("pair-quote", offered.map((p) => p.split("/")[1]), pair.split("/")[1]);
  await act("choose", { what: pair });
  if (state) pairChoices(state);
}
$("pair-base").onchange = $("pair-quote").onchange = choosePair;
// The tutorial is played like a disc: it waits stopped until Play, Pause holds it where it is and Play
// carries on, Stop goes back to lesson 1 and waits. The server keeps the state; these only ask for it.
const transportOf = (kind) => () => {
  looked = 0;
  armedFor = null;
  return act(kind);
};
$("lesson-play").onclick = () => transportOf(playing() ? "pause" : "play")();
$("lesson-stop").onclick = transportOf("stop");
$("lesson-skip").onclick = () => act("skip");
// Previous, as on a disc: once starts this lesson over, twice within two seconds goes to the one before.
let lastBack = 0;
$("lesson-back").onclick = () => {
  const again = Date.now() - lastBack < 2000;
  lastBack = again ? 0 : Date.now();
  looked = 0;
  armedFor = null;
  act(again ? "back" : "again");
};
// The same keys on the keyboard, whichever control has focus: Space plays and pauses, the arrows go
// back and skip, Escape stops. A key typed in a field, or on a button or slider that uses it, is left
// to that control, and so is any key while a dialog is open or on any page but the tutorial.
const TRANSPORT_KEYS = { " ": "lesson-play", ArrowLeft: "lesson-back", ArrowRight: "lesson-skip", Escape: "lesson-stop" };
addEventListener("keydown", (e) => {
  const id = TRANSPORT_KEYS[e.key];
  if (!id || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || mode !== "tutorial" || !state?.lesson) return;
  if (document.querySelector("dialog[open]")) return;
  const target = e.target;
  if (target?.isContentEditable || /^(INPUT|SELECT|TEXTAREA|A)$/.test(target?.tagName ?? "")) return;
  // a focused button does its own work on Space and Enter; the arrows and Escape are ours
  if (target?.tagName === "BUTTON" && e.key === " ") return;
  if ($(id).disabled) return;
  e.preventDefault();
  $(id).click();
});

// The tutorial names the controls a lesson is about; the page highlights
// them.
// The exact element each step of a lesson points at (ADR 0052): the slider
// and not its whole block, the one button, the one figure. A step is lit while
// the page can see it is still to do.
const TARGETS = { chart: "chart", equity: "equity", leverage: "leverage", stake: "stake", buy: "buy", sell: "sell", close: "close", pnl: "pnl", level: "level", stop: "pexits", stopthumb: "psl-dist", borrow: "borrow" };
function lesson(s) {
  $("lesson").hidden = !s.lesson;
  for (const el of document.querySelectorAll(".focus")) el.classList.remove("focus");
  if (!s.lesson) return;
  const l = s.lesson;
  // The transport shows its state: Play is Pause while playing, and the track keys wait for Play.
  const transport = s.transport ?? "playing";
  $("lesson").dataset.transport = transport;
  for (const id of ["lesson-back", "lesson-skip"]) $(id).disabled = transport === "stopped";
  $("lesson-stop").disabled = transport === "stopped";
  const verb = transport === "playing" ? "tutorialPause" : transport === "paused" ? "tutorialContinue" : "tutorialPlay";
  $("lesson-play").dataset.tip = verb;
  $("lesson-play").setAttribute("aria-label", t(verb));
  $("lesson-play").setAttribute("aria-pressed", String(transport === "playing"));
  const moving = s.phase === "moving";
  // The lesson in this language; in English, as the server sent it.
  const own = T[lang].lessons[l.id] ?? l;
  $("lesson-n").textContent = l.finished ? t("lessonDone") : t("lessonN", { n: l.n, of: l.of });
  $("lesson-title").textContent = l.finished ? t("doneTitle") : own.title;
  $("lesson-text").textContent = l.finished ? t("doneText") : own.text;
  $("lesson-task").textContent = l.finished ? t("doneTask") : transport === "stopped" ? t("pressPlay") : transport === "paused" ? t("pausedTask") : moving ? t("watch") : own.task;
  retip();
}
// How many of the lesson's looks the player has had (ADR 0052, 0053): a step
// to look at waits for them, and they move on by a click or a key, or by
// doing the next thing. A new lesson starts again. Pure choosing is in /plan.js.
let looked = 0;
let lookedIn = null;
// A step whose control is not on screen yet (Close before there is a position,
// Borrow before a wipe-out) is passed over: pointing at nothing helps no one.
const onScreen = (el) => !!el && el.getClientRects().length > 0;
function currentStep(l) {
  if (lookedIn !== l.id) {
    lookedIn = l.id;
    looked = 0;
  }
  return planStep(l.plan ?? [], { choice, looked, moves: l.moves }, (s) => onScreen($(TARGETS[s.target])));
}
// When a step has waited AUTO_S seconds with no input, the tutorial does it
// for the player (ADR 0054): a slider slides, a button is pressed through the
// same server rules as a player's press, a look moves on. A countdown shows in
// the step's words all that time, and any click, key or slider move starts it
// again. It never runs while the page is hidden, a dialog is open, or the
// price is moving.
const AUTO_S = 9;
// Whether the tutorial is playing, from the server's own transport: stopped and paused both hold.
const playing = () => state?.mode === "tutorial" && state.transport === "playing";
// Stopped shows nothing, a blank screen that waits; paused keeps the frame, with the lit control and
// the step's words and its seconds held; playing runs.
const stopped = () => state?.mode === "tutorial" && state.transport === "stopped";
let autoLeft = AUTO_S;
let autoTimer = 0;
let sliding = false;
function armAuto() {
  clearInterval(autoTimer);
  autoLeft = AUTO_S;
  if (!playing() || !state?.lesson || state.lesson.finished || state.phase === "moving") return;
  showCount();
  autoTimer = setInterval(tickAuto, 1000);
}
function tickAuto() {
  const l = state?.lesson;
  if (!l || l.finished || state.phase === "moving") return clearInterval(autoTimer);
  if (!playing() || !fresh || document.hidden || document.querySelector("dialog[open]:not(#dad)") || sliding) return;
  if (--autoLeft > 0) return showCount();
  clearInterval(autoTimer);
  doForPlayer(l);
}
function showCount() {
  if (hint.hidden || !hintFor) return;
  // The countdown leads the tip, so it is the first thing read and a long tip
  // can never cut it off (ADR 0059).
  const text = `${t("autoIn", { s: autoLeft })} · ${hintFor.words}`;
  if (hint.textContent !== text) {
    hint.textContent = text;
    placeHint(hintFor.el, text);
  }
}
function doForPlayer(l) {
  const step = currentStep(l);
  const move = step && autoMove(step, l.id, l.plan, choice);
  if (!move) return armAuto();
  hint.textContent = `${t("autoIn", { s: 0 })} · ${hintFor?.words ?? ""}`;
  if (move.slide) slideTo(move.slide.slider, move.slide.value, armAuto);
  else if (move.look) {
    nextLook();
    armAuto();
  } else {
    act(move.act.kind, move.act);
    armAuto();
  }
}
// A slider moves to the value a step asks for, a few frames at a time, so the
// player sees it go; it fires the same input events a hand would, so every
// handler runs as usual. Reduced motion jumps there.
function slideTo(which, value, done) {
  const input = $(which);
  const target = which === "leverage" ? ladder.indexOf(value) : STAKES.indexOf(value);
  const from = Number(input.value);
  const steps = matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 24;
  let i = 0;
  sliding = true;
  const frame = () => {
    i++;
    input.value = String(Math.round(from + ((target - from) * i) / steps));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    if (i < steps) requestAnimationFrame(frame);
    else {
      input.value = String(target);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      sliding = false;
      done();
    }
  };
  requestAnimationFrame(frame);
}
// Move on from the step to look at that is on show, if one is. Returns whether
// it did, so a click on a control still does its own work.
function nextLook() {
  if (!playing()) return false;
  const l = state?.lesson;
  if (!l || l.finished || state.phase === "moving" || currentStep(l)?.until !== "look") return false;
  looked++;
  // A lesson of looks alone, the welcome, is over when the last look is: the
  // page tells the server, since there is no Next button (ADR 0057).
  if (!currentStep(l)) act("next");
  spotlight(l, false);
  return true;
}
// Any click, or Enter, moves on from a step to look at. The click carries on to whatever it
// landed on, so pressing a control still does its job; a key typed in a field or on a control,
// where the same key does something else, is left alone (ADR 0053). Space and the arrows are
// the transport's now, so each key has one meaning.
addEventListener("pointerdown", (e) => {
  if (e.target.closest?.("dialog[open]:not(#dad), #name-box")) return;
  // A click on the lesson card's own buttons (the transport) is not a
  // click on the page: it must not move a look step on.
  if (!e.target.closest?.("#lesson") && nextLook()) return;
  if (state?.lesson && !state.lesson.finished && playing()) armAuto();
});
addEventListener("keydown", (e) => {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.key !== "Enter") return;
  const t = e.target;
  if (document.querySelector("dialog[open]:not(#dad)") || t?.isContentEditable || /^(INPUT|SELECT|TEXTAREA|BUTTON|A)$/.test(t?.tagName ?? "")) return;
  if (nextLook()) e.preventDefault();
});
// A key or a slider move by the player starts the countdown again.
addEventListener("keydown", () => state?.lesson && !sliding && armAuto(), true);
for (const id of ["leverage", "stake"]) $(id).addEventListener("input", () => !sliding && state?.lesson && armAuto());
// The step's words, in this language, kept beside the lit control: a small
// label that follows it, so the instruction is where the eye already is.
const hint = Object.assign(document.createElement("div"), { id: "step-hint", className: "step-hint", hidden: true });
document.body.append(hint);
function placeHint(el, text) {
  hint.textContent = text;
  hint.hidden = false;
  const r = el.getBoundingClientRect();
  const h = hint.getBoundingClientRect();
  const gap = 14;
  // A big target (the chart) has no outside to speak of: the words go inside
  // it, at its top left, where nothing else is.
  if (r.width > innerWidth * 0.5) {
    hint.style.left = `${r.left + 12}px`;
    hint.style.top = `${r.top + 12}px`;
    hint.dataset.side = "inside";
    return;
  }
  // Try each side and keep the one that covers the fewest other controls and
  // labels, and stays on the page: the words go where they hide least.
  const center = { x: r.left + r.width / 2 - h.width / 2, y: r.top + r.height / 2 - h.height / 2 };
  const sides = {
    left: { x: r.left - h.width - gap, y: center.y },
    right: { x: r.right + gap, y: center.y },
    below: { x: center.x, y: r.bottom + gap },
    above: { x: center.x, y: r.top - h.height - gap },
  };
  const others = [...document.querySelectorAll("button, input, label, dt, dd, output, h2, .task, .lesson-body p")].filter((e) => e !== el && !el.contains(e) && !e.contains(el) && !e.closest("#step-hint") && e.getClientRects().length);
  // Above and below slide sideways to stay on the page, so only running off
  // the top or bottom, or off the side for left and right, counts against them.
  const fit = (p) => ({ x: Math.max(4, Math.min(innerWidth - h.width - 4, p.x)), y: p.y });
  for (const s of ["below", "above"]) sides[s] = fit(sides[s]);
  const score = (p) => {
    const box = { left: p.x, top: p.y, right: p.x + h.width, bottom: p.y + h.height };
    const off = box.left < 4 || box.top < 4 || box.right > innerWidth - 4 || box.bottom > innerHeight - 4;
    // What it hides matters: a button or a slider costs most, a figure or a
    // label less, a heading or a paragraph least.
    const cost = (e) => (e.matches("button, input") ? 10 : e.matches("dt, dd, output, label") ? 3 : 1);
    const hit = others.filter((e) => { const b = e.getBoundingClientRect(); return b.width && b.right > box.left && b.left < box.right && b.bottom > box.top && b.top < box.bottom; }).reduce((n, e) => n + cost(e), 0);
    return (off ? 1000 : 0) + hit;
  };
  let best = "left";
  for (const s of ["left", "right", "below", "above"]) if (score(sides[s]) < score(sides[best])) best = s;
  hint.style.left = `${Math.max(4, Math.min(innerWidth - h.width - 4, sides[best].x))}px`;
  hint.style.top = `${Math.max(4, Math.min(innerHeight - h.height - 4, sides[best].y))}px`;
  hint.dataset.side = best;
}
// The pointer is the tutorial's alone: gone the moment another mode is on show,
// or the tab changes, since only a tutorial's state has a lesson to clear it.
function clearPointer() {
  for (const el of document.querySelectorAll(".focus")) el.classList.remove("focus");
  hint.hidden = true;
  hintFor = null;
  armedFor = null;
  clearInterval(autoTimer);
}
let scrolledTo = null;
function spotlight(l, moving) {
  for (const el of document.querySelectorAll(".focus")) el.classList.remove("focus");
  hint.hidden = true;
  hintFor = null;
  if (stopped() || l.finished || moving) return;
  const step = currentStep(l);
  if (!step) return;
  const el = $(TARGETS[step.target]);
  // A control below the fold is brought into view, once per step, or the ring
  // would be on something the player cannot see.
  const key = `${l.id}:${l.plan.indexOf(step)}`;
  if (scrolledTo !== key) {
    scrolledTo = key;
    const r = el.getBoundingClientRect();
    // Not merely on screen but with room around it for its words: within the
    // middle of the viewport, else it is brought to the centre.
    if (r.top < innerHeight * 0.15 || r.bottom > innerHeight * 0.8) el.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  el.classList.add("focus");
  const i = l.plan.indexOf(step);
  const says = T[lang].lessons[l.id]?.steps?.[i] ?? step.say;
  const words = `${l.plan.length > 1 ? `${i + 1}/${l.plan.length} ` : ""}${says}`;
  placeHint(el, `${t("autoIn", { s: AUTO_S })} · ${words}`);
  // The words are placed against where the control is now, so when the page
  // is scrolling to it, they are placed again as it settles, and as the player
  // scrolls or resizes afterwards.
  hintFor = { el, words };
  // A new step starts the countdown afresh; a redraw of the same step does not.
  const stepKey = `${l.id}:${i}:${looked}`;
  if (stepKey !== armedFor) {
    armedFor = stepKey;
    armAuto();
  } else showCount();
}
// The chart redraws when its box changes size (a window resized, a panel folded, a position row appearing), since it
// is drawn to the box (ADR 0076).
// The header's height, for the first screen's sizing (ADR 0076): it changes with the language and wraps at some
// widths, so it is measured, not assumed. Where the browser has no ResizeObserver (an old one, or the checks' own
// page), a window resize does both jobs.
const header = document.querySelector("header.top");
const measureHead = () => header && document.documentElement.style.setProperty("--head", `${header.offsetHeight}px`);
measureHead();
if (typeof ResizeObserver === "function") {
  new ResizeObserver(() => state && draw(state)).observe($("chart"));
  if (header) new ResizeObserver(measureHead).observe(header);
} else addEventListener("resize", () => (measureHead(), state && draw(state)));
let armedFor = null;
let hintFor = null;
let settle = 0;
const replace = () => {
  clearTimeout(settle);
  settle = setTimeout(() => hintFor && !hint.hidden && placeHint(hintFor.el, `${t("autoIn", { s: autoLeft })} · ${hintFor.words}`), 60);
};
addEventListener("scroll", replace, { passive: true });
addEventListener("resize", replace);
// The ticket's two toggles and one joined track (ADR 0034): the stop loss
// toggle on the left and the take profit toggle on the right, a thumb each,
// held to its own half so the two never cross. Each shows its percentage
// only, grey while its own toggle is off. The fills are drawn here, since a
// slider paints to the left of its thumb, wrong for the stop loss.
const HALF = { sl: [0, 480], tp: [520, 1000] };
function paintExits() {
  for (const k of ["sl", "tp"]) {
    const [min, max] = HALF[k];
    const { from, to } = fillSpan(k, Number($(`${k}-dist`).value), min, max);
    // the stop loss's half is the left 48% of the track, the take profit's the right 48%
    const left = k === "sl" ? 0 : 52;
    $(`${k}-fill`).style.left = `${left + from * 48}%`;
    $(`${k}-fill`).style.width = `${(to - from) * 48}%`;
    $(`${k}-pct`).textContent = `${exits[k].dist}%`;
    $(`${k}-on`).setAttribute("aria-checked", String(exits[k].on));
    $("exits").querySelector(".exit-track").dataset[k] = String(exits[k].on);
  }
}
function seatExits() {
  for (const k of ["sl", "tp"]) $(`${k}-dist`).value = String(Math.round(exitPos({ kind: k, dist: exits[k].dist }, broker.distances) * 1000));
  paintExits();
}
for (const k of ["sl", "tp"]) {
  $(`${k}-on`).onclick = () => {
    exits[k].on = !exits[k].on;
    paintExits();
  };
  $(`${k}-dist`).oninput = () => {
    exits[k].dist = exitAt(Number($(`${k}-dist`).value) / 1000, broker.distances).dist;
    // moving a thumb switches its own exit on: the point of moving it
    exits[k].on = true;
    paintExits();
  };
}
// The position's own two toggles and track (ADR 0037), the ticket's control
// bound to the open position: a toggle sets the exit at the distance shown or
// removes it, and letting go of a thumb places it. A held distance is kept per
// exit so the thumb stays where it was set while the price moves.
const held = { sl: 5, tp: 10 };
let grabbed = null;
function paintHeld(on) {
  for (const k of ["sl", "tp"]) {
    const [min, max] = HALF[k];
    if (grabbed !== k) $(`p${k}-dist`).value = String(Math.round(exitPos({ kind: k, dist: held[k] }, broker.distances) * 1000));
    const { from, to } = fillSpan(k, Number($(`p${k}-dist`).value), min, max);
    const left = k === "sl" ? 0 : 52;
    $(`p${k}-fill`).style.left = `${left + from * 48}%`;
    $(`p${k}-fill`).style.width = `${(to - from) * 48}%`;
    $(`p${k}-pct`).textContent = `${held[k]}%`;
    $(`p${k}-on`).setAttribute("aria-checked", String(on[k]));
    $("pexits").querySelector(".exit-track").dataset[k] = String(on[k]);
  }
}
for (const k of ["sl", "tp"]) {
  const kind = k === "sl" ? "stop" : "take";
  $(`p${k}-on`).onclick = () => {
    const at = state?.you.pos?.[kind];
    act(kind, at ? {} : { pct: held[k] });
  };
  $(`p${k}-dist`).oninput = () => {
    grabbed = k;
    held[k] = exitAt(Number($(`p${k}-dist`).value) / 1000, broker.distances).dist;
    $(`p${k}-pct`).textContent = `${held[k]}%`;
    paintHeld({ sl: !!state?.you.pos?.stop, tp: !!state?.you.pos?.take });
  };
  $(`p${k}-dist`).onchange = () => {
    grabbed = null;
    act(kind, { pct: held[k] });
  };
}

// The ticket: the prices a sell and a buy fill at, and what the chosen
// order would put at stake, worked out from the account the server sent.
function ticket(s) {
  $("bid").textContent = quoted(s.bid);
  $("ask").textContent = quoted(s.ask);
  $("spread").textContent = t("spread", { pips: ((s.ask - s.bid) / (s.digits === 3 ? 0.01 : 0.0001)).toFixed(1) });
  // the desk's own rule, from the module both share
  const used = s.you.pos?.margin ?? 0;
  const margin = stakeMargin(s.you.equity, used, choice.stake);
  // the stake's track as the whole account: what is in use, and what this order would add after it (ADR 0077)
  const bar = stakeBar(s.you.equity, used, choice.stake);
  $("stake-used").style.width = `${bar.used * 100}%`;
  $("stake-order").style.left = `${bar.used * 100}%`;
  $("stake-order").style.width = `${bar.order * 100}%`;
  $("stake-box").classList.toggle("cut", bar.cut && !s.you.out);
  const controls = margin * choice.leverage;
  // beside the stake, what this order puts in and the position it controls, in yen (ADR 0079)
  $("stake-note").replaceChildren(...rich(t("stakeNote"), { margin: yen(margin), controls: yen(controls) }));
  // At L× leverage, a move of 1/L against you is everything you put in.
  const wipe = 100 / choice.leverage;
  // With a position open, a same-side order adds to it and an opposite
  // one closes it, so the preview says which.
  const pos = s.you.pos;
  const same = pos?.side === 1 ? t("buy") : t("sell");
  const other = pos?.side === 1 ? t("sell") : t("buy");
  const away = `${wipe < 1 ? wipe.toFixed(2) : wipe.toFixed(0)}%`;
  // Two whole phrases on one line, joined by a dot and wrapping only there:
  // what the order puts in, then what it risks or does.
  // Out of the round after a cut (ADR 0026): no order to preview, only
  // the way back in.
  const [one, two] = s.you.out
    ? [t("previewOut1"), t("previewOut2")]
    : pos
      ? margin > 0
        ? [t("previewAdd1", { same, lev: choice.leverage }), t("previewAdd2", { other })]
        : [t("previewFull1"), t("previewFull2", { other })]
      : margin > 0
        ? [t("previewOpen"), ""]
        : [t("previewNone"), ""];
  // what goes in, as a share of the account: the game ranks on percentages, so the ticket speaks in them (ADR 0078)
  const share = s.you.equity > 0 ? `${Math.round((margin / s.you.equity) * 100)}%` : "0%";
  const slots = { margin: yen(margin), controls: yen(controls), away, share };
  $("preview-1").replaceChildren(...rich(one, slots));
  $("preview-2").replaceChildren(...rich(two, slots));
}
// The pending row: what this order would be as a pending one, or what is waiting, with a Cancel (ADR 0078).
function pending(s) {
  const ui = T[lang].ui;
  const waiting = s.you.pending;
  const typeName = (type) => ui.pendTypes?.[type] ?? T.en.ui.pendTypes[type];
  $("pend-cancel").hidden = !waiting;
  $("pend-waiting").textContent = waiting ? t("pendWaiting", { type: typeName(waiting.type), at: quoted(waiting.at) }) : "";
  const price = s.prices.at(-1);
  $("pend-at").step = String(10 ** -(quoted(price).split(".")[1]?.length ?? 0));
  const share = `${Math.round(choice.stake * 100)}%`;
  // what the typed level makes, against the price now: a limit or a stop, or nothing yet at the price itself
  $("pend-what").textContent = pend.at === null || pend.at === price ? "" : t("pendWhat", { type: typeName(pendType(pend.side, pend.at, price)), lev: choice.leverage, share });
  $("pend-place").disabled = deskClosed || pend.at === null;
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

// A face as an image the chart can draw, made once from its pixel art and kept: a canvas
// cannot draw the SVG string the rest of the page puts in the DOM.
const faces = new Map();
function faceImage(face) {
  let img = faces.get(face);
  if (!img) {
    img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg(face, 16))}`;
    img.onload = () => requestAnimationFrame(() => state && draw(state));
    faces.set(face, img);
  }
  return img;
}
function draw(full) {
  const s = windowed(full);
  const canvas = $("chart");
  const ctx = canvas.getContext("2d");
  // The chart is drawn in the CSS pixels it is shown at (ADR 0076), so its text and margins keep their size however the
  // layout sizes the box, and it is sharp on a scaled screen: the canvas holds that many device pixels and the drawing
  // is scaled to them. Before the box has a size (hidden, or folded), it keeps the size it last had.
  const ratio = devicePixelRatio || 1;
  const w = canvas.clientWidth || canvas.width / ratio;
  const boxH = canvas.clientHeight || canvas.height / ratio;
  const [pw, ph] = [Math.round(w * ratio), Math.round(boxH * ratio)];
  // a new size clears the canvas, so it is set only when the box has changed
  if (canvas.width !== pw || canvas.height !== ph) [canvas.width, canvas.height] = [pw, ph];
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  // With the RSI on, the price takes the top and the RSI a pane below; the canvas, and so the layout, keeps its size.
  const pane = studies.rsi && s.mode !== "tutorial" ? 84 : 0;
  const h = boxH - pane;
  const css = getComputedStyle(document.documentElement);
  ctx.fillStyle = css.getPropertyValue("--chart");
  ctx.fillRect(0, 0, w, boxH);
  const prices = s.prices;
  const k = s.steps;
  // Indicators on each day's close, drawn at the day's centre; the bands
  // widen the price range so they stay on the chart.
  const tutorial = s.mode === "tutorial";
  // Each indicator is worked out on every day there is, then cut to the days shown.
  const cut = (values) => values.slice(s.skip ?? 0);
  const days = closes(s.all ?? prices, k);
  const bands = studies.bb && !tutorial ? cut(bollinger(days, PERIODS.band, 2)) : [];
  const shown = bands.filter(Boolean);
  // The stop and the margin lines join the scale when they are near
  // (within 3%, as at 100× and up), so high leverage shows how close the
  // losscut is.
  const pos = s.you.pos;
  const near = pos ? [pos.stop, pos.take, pos.call, pos.cut].filter((p) => p && Math.abs(p / prices.at(-1) - 1) < 0.03) : [];
  const lo = Math.min(...prices, ...shown.map((b) => b.lower), ...near);
  const hi = Math.max(...prices, ...shown.map((b) => b.upper), ...near);
  const pad = (hi - lo) * 0.15 || hi * 0.002;
  const top = hi + pad;
  const bottom = lo - pad;
  // The newest tick sits at the right edge and older ones count back from it; with no
  // history (the tutorial) the round runs from the left as it always did.
  const x = (i) => place(s, i) * (w - 70);
  // The price scale leaves HEAD pixels at the top for the quote that floats there.
  const HEAD = 66;
  const y = (p) => h - ((p - bottom) / (top - bottom)) * (h - HEAD);
  // Day lines, and the price grid on the right.
  ctx.strokeStyle = css.getPropertyValue("--chart-grid");
  ctx.lineWidth = 1;
  const up = css.getPropertyValue("--up");
  const down = css.getPropertyValue("--down");
  ctx.fillStyle = css.getPropertyValue("--muted");
  ctx.font = "12px 'JetBrains Mono', ui-monospace, monospace";
  // One line a day, found by the tick's own count from the bell and not by its place on screen, so the lines
  // stay on the day breaks as the window slides; the tutorial has no days and keeps a line every 5 candles.
  // Each played day is named "D1".."D5" at its line, and the days of history before the bell have no name.
  const dayStep = s.dayTicks;
  const first = s.tick - (prices.length - 1);
  for (let i = 0; i < prices.length; i++) {
    const at = first + i;
    if (at % dayStep !== 0) continue;
    const xd = x(i);
    ctx.beginPath();
    ctx.moveTo(xd, 0);
    ctx.lineTo(xd, h + pane);
    ctx.stroke();
    if (!tutorial && at >= 0 && xd < w - 110) ctx.fillText(`D${at / dayStep + 1}`, xd + 4, h - 6);
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
    if (Math.abs(y(p) - y(prices.at(-1))) > 16) ctx.fillText(quoted(p), w - 66, Math.min(h - (pane ? 8 : 4), Math.max(14, y(p) + 4)));
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
    if (pos.stop) marks.push([pos.stop, down, t("slFull")]);
    if (pos.take) marks.push([pos.take, up, t("tpFull")]);
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
    } else labels.push({ at: p >= top ? 0 : h, colour, text: `${p >= top ? "▲" : "▼"} ${text} ${quoted(p)}` });
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
    const bw = Math.max(3, (x(k) - x(0)) * 0.6);
    ctx.fillRect(cx - bw / 2, y(Math.max(open, close)), bw, Math.max(2, Math.abs(y(open) - y(close))));
  }
  // Moving averages over the candles, and their legend top-left.
  const legend = [];
  if (studies.ma && !tutorial) {
    const fast = cut(sma(days, PERIODS.fast));
    const slow = cut(sma(days, PERIODS.slow));
    line(slow.map((v) => v && y(v)), css.getPropertyValue("--ma-slow"));
    line(fast.map((v) => v && y(v)), css.getPropertyValue("--ma-fast"));
    if (fast.at(-1)) legend.push([`MA ${spanOf(PERIODS.fast, perDay(s))} ${quoted(fast.at(-1))}`, css.getPropertyValue("--ma-fast")]);
    if (slow.at(-1)) legend.push([`MA ${spanOf(PERIODS.slow, perDay(s))} ${quoted(slow.at(-1))}`, css.getPropertyValue("--ma-slow")]);
  }
  if (shown.length) legend.push([`BB(${spanOf(PERIODS.band, perDay(s))},2)`, css.getPropertyValue("--band")]);
  // On a phone the canvas is shrunk to a third, too small for a legend.
  const small = canvas.clientWidth < 600;
  let lx = 10;
  for (const [text, colour] of small ? [] : legend) {
    ctx.fillStyle = colour;
    ctx.fillText(text, lx, HEAD - 8);
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
    const r = cut(rsi(days, PERIODS.rsi));
    line(r.map((v) => v === null ? null : ry(v)), css.getPropertyValue("--rsi"));
    const now = r.at(-1);
    ctx.fillStyle = now === null ? css.getPropertyValue("--muted") : now >= 70 ? down : now <= 30 ? up : css.getPropertyValue("--rsi");
    if (!small) ctx.fillText(`RSI(${PERIODS.rsi}) ${now === null ? "—" : now.toFixed(1)}`, 10, h + 20);
  }
  // A face at each moment a trader opened, added to, closed or was cut out of a position
  // (ADR 0064), on the price of that tick, with an arrow for the way and a ring if it is mine.
  const pink = css.getPropertyValue("--pink");
  const muted = css.getPropertyValue("--muted");
  ctx.font = "9px 'JetBrains Mono', ui-monospace, monospace";
  for (const m of s.marks ?? []) {
    const i = prices.length - 1 - (s.tick - m.tick);
    if (i < 0 || i > prices.length - 1) continue;
    const cx = x(i);
    if (cx < 8 || cx > w - 78) continue;
    const my = Math.max(HEAD + 8, Math.min(h - 8, y(prices[i])));
    const img = faceImage(m.face);
    ctx.globalAlpha = m.you ? 1 : 0.85;
    if (img.complete && img.naturalWidth) ctx.drawImage(img, cx - 7, my - 7, 14, 14);
    ctx.globalAlpha = 1;
    if (m.you) {
      ctx.strokeStyle = pink;
      ctx.lineWidth = 2;
      ctx.strokeRect(cx - 8, my - 8, 16, 16);
      ctx.lineWidth = 1;
    }
    // The way, beside the face: a green arrow for a buy below it, a red one for a sell above
    // it; a close or a cut is a small dot, or a cross when the broker did it, below it.
    const opened = m.kind === "open" || m.kind === "add";
    const glyph = opened ? (m.side === 1 ? "▲" : "▼") : m.kind === "stopout" || m.kind === "zerocut" ? "✕" : "●";
    ctx.fillStyle = opened ? (m.side === 1 ? up : down) : muted;
    ctx.fillText(glyph, cx - 3, opened && m.side === -1 ? my - 10 : my + 19);
  }
  // the marks' small type must not carry on to the price tag below
  ctx.font = "12px 'JetBrains Mono', ui-monospace, monospace";
  const last = prices.at(-1);
  ctx.strokeStyle = css.getPropertyValue("--chart-line");
  ctx.beginPath();
  ctx.moveTo(0, y(last));
  ctx.lineTo(w - 70, y(last));
  ctx.stroke();
  ctx.fillStyle = css.getPropertyValue("--chart-line");
  ctx.fillRect(w - 70, y(last) - 9, 70, 18);
  ctx.fillStyle = css.getPropertyValue("--chart");
  ctx.fillText(quoted(last), w - 66, y(last) + 4);
}

// Effects: speech bubbles over a trader when the room should notice
// them, a burst of emoji on a prayer, coins on a win, and the price
// flashing as it moves. They float in a fixed layer above the page and
// never move its layout; with reduced motion they appear without moving.
const fx = $("fx");
// A pop over a control rises above it; one in the room sits on its row,
// so it never hides the trader above.
// Floats an element over its target for `ms`; a target off screen gets
// nothing, and the caller is told, so it can say it another way.
function float(el, target, ms, onRow = false) {
  const r = target.getBoundingClientRect();
  if (!r.width || r.bottom < 0 || r.top > innerHeight) return false;
  el.style.left = `${Math.min(Math.max(r.left + r.width / 2, 90), innerWidth - 90)}px`;
  el.style.top = `${onRow ? r.top + r.height / 2 : r.top}px`;
  fx.append(el);
  setTimeout(() => el.remove(), ms);
  return true;
}
function bubble(target, text, kind) {
  const onRow = !!target.closest("#traders");
  const b = Object.assign(document.createElement("div"), { className: `bubble b-${kind}${onRow ? " row" : ""}`, textContent: text });
  return float(b, onRow ? target.closest("li") : target, 2600, onRow);
}
// A house trader whose row is off screen still speaks (ADR 0031): its line
// goes into the feed, which is always in view, with its face.
const said = [];
function sayInFeed(p, text) {
  said.unshift({ who: p.who, text, at: Date.now() });
  said.splice(6);
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
// A house trader says its own line, in character (ADR 0031): a win or a
// loss as such, and otherwise the moment the pop marks.
function botLine(p) {
  const lines = T[lang].lines[p.who];
  if (!lines) return null;
  const moment = p.kind === "close" ? (p.pnl >= 0 ? "win" : "loss") : p.kind;
  if (!lines[moment]) return null;
  // Not the same line twice running, when the bot has another.
  const fresh = lines[moment].filter((l) => l !== lastLine.get(p.who));
  const line = pick(fresh.length ? fresh : lines[moment]);
  lastLine.set(p.who, line);
  return line;
}
const lastLine = new Map();
function popText(p) {
  const said = botLine(p);
  if (said) return p.kind === "close" ? `${said} ${p.pnl >= 0 ? "+" : ""}${yen(p.pnl)}` : said;
  if (p.kind === "pray") return pick(T[lang].prayers[p.way === -1 ? "fall" : "rise"]);
  if (p.kind === "close") return `${p.pnl >= 0 ? "+" : ""}${yen(p.pnl)}${p.pnl > 0 ? " 💰" : p.pnl < 0 ? " 💸" : ""}`;
  return `${ICONS.pops[p.kind] ?? ""} ${(T[lang].pops[p.kind] ?? "").replaceAll("{lev}", String(p.lev ?? ""))}`.trim();
}
// Where a pop shows: over the trader's row in the room, or, for your own,
// over the control you used, since your row may be off screen.
function popAt(p, s) {
  if (p.who === s.you.code) {
    if (p.kind === "pray") return $(p.way === -1 ? "pray-fall" : "pray-rise");
    if (p.kind === "close") return $("pnl-box");
    if (p.kind === "call" || p.kind === "stopout" || p.kind === "zerocut") return $("level-box");
    if (p.kind === "borrow") return $("equity");
    return $(s.you.pos?.side === -1 ? "sell" : "buy");
  }
  return document.querySelector(`#traders li[data-id="${CSS.escape(p.who)}"] .n`);
}
// When each house trader last said something, to space out their prayers.
const spoke = new Map();
function effects(s, price) {
  const list = s.pops ?? [];
  if (popped !== null) {
    for (const p of list) {
      if (p.n <= popped) continue;
      const at = popAt(p, s);
      if (!at) continue;
      // Your own losscut has the full-screen stamp; a bubble would only cover it.
      if (p.who === s.you.code && (p.kind === "stopout" || p.kind === "zerocut")) continue;
      // A bot speaks at most every few seconds, or a losing one praying
      // every tick would drown the room; a cut or a loan always gets said.
      if (p.who.startsWith("bot:") && p.kind === "pray" && Date.now() - (spoke.get(p.who) ?? 0) < 6000) continue;
      if (p.who.startsWith("bot:")) spoke.set(p.who, Date.now());
      const text = popText(p);
      const shown = bubble(at, text, p.kind === "close" ? (p.pnl >= 0 ? "win" : "loss") : p.kind);
      if (!shown && p.who.startsWith("bot:")) sayInFeed(p, text);
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
// The market's two days before the round opened, kept across the updates
// that carry only new prices (ADR 0062); the tutorial has none.
let before = [];
let roundNo = 0;
let shown = null;
async function receive(s, source = events) {
  // A message from the market this page just left is dropped.
  if (source !== events || s.mode !== mode || navigator.onLine === false) return;
  if (!fresh && s.from !== 0) {
    const res = await fetch(`/api/state?mode=${mode}`);
    if (!res.ok) throw new Error("state unavailable");
    return receive(await res.json(), source);
  }
  if (s.from === 0) {
    prices = [...s.prices];
    before = s.history ?? [];
  } else if (s.mode === shown && s.round === roundNo && s.from <= prices.length) {
    // new prices go on the end of the array this page owns, not into a copy of all of it
    prices.length = s.from;
    prices.push(...s.prices);
  } else {
    const res = await fetch(`/api/state?mode=${mode}`);
    if (!res.ok) throw new Error("state unavailable");
    return receive(await res.json(), source);
  }
  roundNo = s.round;
  shown = s.mode;
  heardAt = Date.now();
  if (!fresh) connection("connectionRestored");
  render({ ...s, prices, history: before });
}

function render(s) {
  state = s;
  const tutorial = s.mode === "tutorial";
  // Whether orders are taken now: a round's trading, or a tutorial whose
  // price is standing still for the player's move.
  const open = tutorial ? s.phase === "waiting" && !s.lesson.finished : s.phase === "trade" || s.phase === "countdown";
  // End is the starter's, in a trading round.
  $("finish").hidden = !(s.phase === "trade" && s.rules);
  // Pause: anyone may, in a trading round that isn't ironman; a pause veils
  // the chart for everyone, with the seconds until it resumes by itself.
  $("pause").hidden = !(s.phase === "trade" && !s.ironman && !s.paused);
  $("round-ctl").hidden = ["pause", "finish"].every((id) => $(id).hidden);
  // Name that year opens halfway through a replay; your guess is shown
  // back to you, and to nobody else, until the bell.
  const guessing = s.mode === "replay" && s.phase === "trade" && s.tick >= s.total / 2;
  $("guess").hidden = !guessing;
  $("guess").classList.toggle("made", s.you.guess !== null);
  $("guess").querySelector("button[type=submit]").disabled = !guessing;
  if (guessing && s.you.guess !== null && document.activeElement !== $("guess-year")) $("guess-year").value = String(s.you.guess);
  if (!guessing && s.phase !== "trade") $("guess-year").value = "";
  $("paused").hidden = tutorial || !s.paused;
  if (s.paused) $("paused-title").textContent = t("pausedTitle", { s: s.paused });
  document.body.classList.toggle("tutorial", tutorial);
  lesson(s);
  lobby(s);
  pairChoices(s);
  // The tab shows a head count as a bare number; its tooltip says what.
  for (const m of ["replay", "simulation"]) {
    $(`here-${m}`).textContent = s.here[m] ? String(s.here[m]) : "";
    setTip(document.querySelector(`[data-mode="${m}"]`), `${tip(m === "simulation" ? "tabSimulation" : "tabReplay")}${s.here[m] ? ` · ${t(s.here[m] === 1 ? "human" : "humans", { n: s.here[m] })}` : ""}`);
  }
  names = new Map(s.traders.map((tr) => [tr.id, tr.bot ? botName(tr.id, tr.name) : nameIn(tr.name, tr.draw)]));
  // On first load the menu starts at the open position's leverage, if
  // any, so a reload shows what the player chose.
  if (!seated) {
    seated = true;
    ladder = s.leverages;
    broker = s.desk;
    sliders();
    seatExits();
    // a new visitor starts at the legal cap
    choice.leverage = levAt(levPos(s.you.pos?.leverage ?? broker.cap, ladder), ladder);
    mark();
    translate();
  }
  const price = s.prices.at(-1);
  const first = s.prices[0];
  $("pair").textContent = s.pair;
  $("price").textContent = quoted(price);
  const ch = (price / first - 1) * 100;
  $("change").textContent = pct(ch / 100);
  $("change").className = ch >= 0 ? "up" : "down";
  // A Scenario's latest headline takes the mode line, so the clue stays
  // in view after the feed has moved on (ADR 0027).
  const head = s.headline && (s.headline.story !== undefined ? T[lang].stories[s.headline.story] : s.headline.scenario ? T[lang].scenarios[s.headline.scenario]?.headlines[s.headline.n] : clueText(lang, s.headline.clue, s.headline.n));
  // Only a clue or headline is shown here; the static label that said which
  // mode this was is gone (ADR 0059), since the tab already says it.
  $("mode").textContent = head ? `📰 ${head}` : "";
  $("mode").hidden = !head;
  setTip($("mode"), head ?? "");
  const clockKey = tutorial ? "clockTutorial" : s.phase === "trade" ? "clockDay" : s.phase === "countdown" ? "clockOpens" : s.phase === "lobby" ? "clockLobby" : "clockClosed";
  // the clock counts days, 48 ticks each; `steps` is the chart's candle and a different thing
  // the hour is the game's hour of the trading day, counted from its start, never the replay's own time of day (ADR 0079)
  const clockValues = { d: Math.max(1, Math.ceil(s.tick / s.dayTicks)), of: Math.max(1, Math.round(s.total / s.dayTicks)), h: Math.floor((((s.tick - 1 + s.dayTicks) % s.dayTicks) * 24) / s.dayTicks), s: s.countdown };
  $("clock").textContent = t(`${clockKey}Short`, clockValues);
  $("clock").setAttribute("aria-label", t(clockKey, clockValues));
  setTip($("clock"), t(clockKey, clockValues));
  // Built from text nodes: the name comes from the server, never as HTML.
  // A pencil says it can be changed.
  me = nameIn(s.you.name, s.you.draw);
  myFace = s.you.face;
  // Your code tells you apart from a namesake; it lives in the tip, so
  // the line keeps its room for the name.
  $("whoami").replaceChildren(avatar(s.you.face, 18), strong(me), Object.assign(document.createElement("span"), { className: "pencil", textContent: "✎", ariaHidden: "true" }));
  setTip($("whoami"), tip("whoami", { name: me, code: s.you.code }));
  if (!s.you.named && !welcomed) {
    welcomed = true;
    openNames(true);
  }
  draw(s);
  ticket(s);
  pending(s);

  const y = s.you;
  // Each amount with its change as a percentage, which is what a trader
  // reads: net worth against the starting money, open P&L against the
  // margin put up for it.
  const worth = y.equity - y.debt;
  const tone = (n) => (n > 0 ? "up" : n < 0 ? "down" : "");
  $("equity").textContent = yen(worth);
  $("equity-pct").textContent = pct(worth / s.start - 1);
  $("equity-pct").className = `rate ${tone(worth - s.start)}`;
  $("pnl").textContent = yen(y.pnl);
  // Toggled, not assigned: the tutorial may have a ring on this figure (ADR 0052).
  $("pnl").classList.toggle("up", y.pnl > 0);
  $("pnl").classList.toggle("down", y.pnl < 0);
  $("pnl-pct").textContent = y.pos ? pct(y.pnl / y.pos.margin) : "";
  $("pnl-pct").className = `rate ${tone(y.pnl)}`;
  $("level").textContent = y.level === null ? "—" : `${y.level}%`;
  $("level-note").textContent = y.pos ? `${y.pos.leverage}×` : "";
  // The meter: net worth against the start, losses left, profit right,
  // on a log scale; with a position open, where its margin call and
  // losscut would land, at half and a fifth of its margin.
  const at = gauge(worth / s.start);
  const mid = 0.5;
  // Any change shows at least a sliver, so the side is always plain.
  const span = worth === s.start ? 0 : Math.max(0.015, Math.abs(at - mid));
  $("meter").style.left = `${(at < mid ? mid - span : mid) * 100}%`;
  $("meter").style.width = `${span * 100}%`;
  $("meter").className = `fill ${tone(worth - s.start)}`;
  const places = {};
  for (const [id, share] of [["mark-call", 0.5], ["mark-cut", 0.2]]) {
    const show = !!y.pos && open;
    $(id).hidden = !show;
    // Level is equity over margin, so at a level the equity is that share of it.
    if (!show) continue;
    const at = gauge((share * y.pos.margin - y.debt) / s.start);
    places[id] = at;
    $(id).style.left = `${at * 100}%`;
    // near an end, the words hang inward from the mark so the bar's edge never cuts them
    $(id).dataset.edge = at < 0.12 ? "start" : at > 0.88 ? "end" : "";
  }
  // the call and the cut can sit close together; then the cut's words drop a line, so the two never run into each other
  $("mark-cut").classList.toggle("low", Math.abs((places["mark-call"] ?? 1) - (places["mark-cut"] ?? 0)) < 0.22);
  // Emergency credit (ADR 0080): its row says what is owed and at what daily rate, the rate the next step would cost
  // when nothing is owed; a pop-up offers a step to a player cut out or broke, while the round trades (the tutorial,
  // whenever the price stands still).
  // a finished tutorial lends no more: its last lesson leaves the player bankrupt, and the credit has done its teaching
  const lending = tutorial ? s.phase === "waiting" && !s.lesson?.finished : s.phase === "trade";
  $("credit-owe").textContent = y.debt ? t("creditOwe", { debt: yen(y.debt) }) : t("creditFree");
  $("credit-owe").classList.toggle("owing", y.debt > 0);
  $("credit-rate").textContent = t("creditRate", { rate: ratePct(creditRate(y.debt || broker.step)) });
  $("credit-borrow").disabled = !lending || !!s.paused || y.credit <= 0;
  $("credit-repay").disabled = !lending || !!s.paused || !y.debt;
  const offer = y.broke && y.credit > 0 && lending && !s.paused;
  $("borrow").hidden = !offer;
  if (!offer) {
    dadAsked = false;
    if ($("dad").open) $("dad").close();
  } else if (!dadAsked && !$("dad").open && !document.querySelector("dialog[open]:not(#dad)")) {
    $("dad-text").textContent = t("dadText", { amount: yen(broker.step), rate: ratePct(creditRate(y.debt + broker.step)) });
    $("dad").show();
  }
  warn(s, open);
  // Your position: one row with its own close and stop, as on any
  // platform, or a line saying what to do when there is none.
  $("pos-row").hidden = !y.pos;
  $("pos-empty").hidden = !!y.pos;
  $("pos-exits").hidden = !y.pos;
  if (y.pos) {
    const side = Object.assign(document.createElement("span"), { className: `tag ${y.pos.side === 1 ? "long" : "short"}`, textContent: y.pos.side === 1 ? t("long") : t("short") });
    $("pos-side").replaceChildren(side, ` ${s.pair} ${y.pos.leverage}×`);
    $("pos-entry").textContent = quoted(y.pos.entry);
    $("pos-now").textContent = quoted(price);
    $("pos-margin").textContent = yen(y.pos.margin);
    $("pos-pnl").textContent = yen(y.pnl);
    $("pos-pnl").className = tone(y.pnl);
    // the return on the margin is what the game ranks by, so it is the row's loudest figure
    $("pos-pct").textContent = pct(y.pnl / y.pos.margin);
    $("pos-pct").className = `pct-big ${tone(y.pnl)}`;
    $("pos-exit").textContent = `${y.pos.stop ? quoted(y.pos.stop) : "—"} / ${y.pos.take ? quoted(y.pos.take) : "—"}`;
    $("pos-cut").textContent = y.pos.cut ? quoted(y.pos.cut) : "—";
    // An exit set elsewhere (an order's, a bot's) shows at its distance now.
    for (const [k, at] of [["sl", y.pos.stop], ["tp", y.pos.take]]) {
      if (at && grabbed !== k) held[k] = exitAt(exitPos({ kind: k, dist: Math.abs((at / price - 1) * 100) }, broker.distances), broker.distances).dist;
    }
    paintHeld({ sl: !!y.pos.stop, tp: !!y.pos.take });
  } else {
    $("position").textContent = t(y.broke && y.credit > 0 ? "broke" : y.out ? "wiped" : open ? "noPos" : "noPosClosed");
  }
  if (y.debt) $("position").textContent += t("owe", { amount: yen(y.debt) });
  const waiting = y.pending;
  $("pend-row").hidden = !waiting;
  if (waiting) {
    const typeName = T[lang].ui.pendTypes?.[waiting.type] ?? T.en.ui.pendTypes[waiting.type];
    $("pend-row-type").replaceChildren(Object.assign(document.createElement("span"), { className: `tag ${waiting.side === 1 ? "long" : "short"}`, textContent: typeName }), ` ${s.pair} ${waiting.leverage}×`);
    $("pend-row-at").textContent = quoted(waiting.at);
    $("pend-row-what").textContent = t("pendRow", { share: `${Math.round(waiting.stake * 100)}%` });
  }
  // the empty line only says something when nothing is open or waiting
  $("pos-empty").hidden = !!y.pos || !!waiting;
  const closed = !open || y.out || !!s.paused || (tutorial && s.transport !== "playing");
  for (const id of ["buy", "sell"]) $(id).disabled = closed;
  deskClosed = closed;
  $("pend-place").disabled = closed || pend.at === null;
  $("pend-cancel").disabled = $("pend-row-cancel").disabled = closed;
  for (const id of ["pray-rise", "pray-fall"]) $(id).disabled = closed || s.phase === "countdown";
  for (const id of ["close", "mobile-close", "warn-close", "psl-on", "ptp-on", "psl-dist", "ptp-dist"]) $(id).disabled = closed || !y.pos;
  $("position-bar").hidden = !y.pos;
  document.body.classList.toggle("has-position", !!y.pos);
  $("mobile-pnl").textContent = yen(y.pnl);
  $("mobile-pnl").className = tone(y.pnl);
  $("mobile-level").textContent = y.level === null ? "—" : `${y.level}%`;

  // The forced loss cut: a new stop-out or wipe-out takes the screen.
  if (cuts !== null && y.cuts > cuts) {
    // Every cut ends the round now (ADR 0026); one that leaves nothing is a
    // wipe-out, and the stamp says which, and what comes next.
    $("losscut-sub").textContent = t(y.balance === 0 ? "zerocut" : "losscut");
    // The stamp is the parody's catchphrase: Japanese in Japanese and
    // English, as the comic says it; in Chinese, what Chinese traders say.
    $("losscut-big").textContent = lang === "zh" ? "强制平仓！" : "強制ロスカット";
    $("losscut-big").lang = lang === "zh" ? "zh-CN" : "ja";
    $("losscut").hidden = false;
    setTimeout(() => ($("losscut").hidden = true), 2200);
  }
  cuts = y.cuts;
  // Bankrupt, owing more than you have: the same stamp, once each time it begins (ADR 0080).
  if (bankrupt === false && y.bankrupt) {
    $("losscut-sub").textContent = t("bankruptText");
    $("losscut-big").textContent = t("bankruptBig");
    $("losscut-big").lang = lang === "zh" ? "zh-CN" : lang;
    $("losscut").hidden = false;
    setTimeout(() => ($("losscut").hidden = true), 3200);
  }
  bankrupt = y.bankrupt;

  const humans = s.traders.filter((t) => !t.bot).length;
  $("count").textContent = t(humans === 1 ? "human" : "humans", { n: humans });
  const list = $("traders");
  // You first, then the other people, then the house traders, each by net worth as the server ranks them (ADR 0078).
  const rank = (tr) => (tr.you ? 0 : tr.bot ? 2 : 1);
  const order = [...s.traders].sort((a, b) => rank(a) - rank(b) || b.equity - a.equity);
  list.replaceChildren(
    ...order.map((tr) => {
      const li = document.createElement("li");
      li.className = `${tr.you ? "you" : ""} ${tr.out ? "out" : ""}`;
      const n = document.createElement("span");
      n.className = "n";
      n.textContent = names.get(tr.id) + (tr.you ? ` ${t("youTag")}` : "");
      // A small badge says what a word would: a bot, gone, or wiped out;
      // the tip says the rest, so the row keeps its room for the name.
      const kind = tr.bot ? "bot" : tr.out ? "wiped" : "person";
      const row = ROWS[kind];
      if (row.badge) n.append(" ", Object.assign(document.createElement("span"), { className: "badge", textContent: row.badge, ariaLabel: t(row.label) }));
      const change = pct(tr.equity / s.start - 1);
      li.dataset.tipText = tip(`${kind}Row`, { motto: T[lang].bots[tr.id]?.motto ?? tr.motto ?? "", code: tr.id, change });
      const p = document.createElement("span");
      if (tr.side) {
        p.className = `pos ${tr.side === 1 ? "long" : "short"}`;
        p.textContent = `${tr.side === 1 ? "▲" : "▼"} ${tr.leverage}×`;
      }
      const e = document.createElement("span");
      e.textContent = change;
      e.className = `eq ${tr.equity > s.start ? "up" : tr.equity < s.start ? "down" : ""}`;
      li.dataset.id = tr.id;
      li.append(avatar(tr.face, 24), n, p, e);
      return li;
    }),
  );
  effects(s, price);
  // What house traders off screen just said leads the feed, with their
  // face and name, for twenty seconds (ADR 0031).
  const talk = said.filter((x) => Date.now() - x.at < 20_000).map((x) => {
    const li = document.createElement("li");
    li.className = "k-said";
    li.append(avatar(x.who, 16), Object.assign(document.createElement("b"), { textContent: nameOf(x.who) }), t("quote", { text: x.text }));
    return li;
  });
  const line = (f) => {
    const li = document.createElement("li");
    li.className = `k-${f.kind}`;
    // Each line wears its kind's icon, so a glance tells a win from a cut.
    li.append(Object.assign(document.createElement("span"), { className: "ico", textContent: ICONS.news[f.key.replace(/^you-/, "")] ?? "·", ariaHidden: "true" }), news(lang, f, nameOf));
    return li;
  };
  // The latest market news, what moves the price, is pinned at the top (ADR 0078); then what traders said, then the
  // rest of the feed, newest first. The news is not listed twice.
  const latest = s.feed.find((f) => f.kind === "news");
  const pinned = latest ? [Object.assign(line(latest), { className: "k-news pinned" })] : [];
  $("feed").replaceChildren(...pinned, ...talk, ...s.feed.filter((f) => f !== latest).map(line));
  // The hall of fame changes only on busts and at the bell.
  const famed = JSON.stringify(s.career);
  if (famed !== fame) {
    fame = famed;
    $("career").replaceChildren(
      ...s.career.map((c) => {
        const tr = document.createElement("tr");
        // Ranked by average score once a trader has played enough rounds;
        // newer traders are listed after, unranked (ADR 0029).
        tr.className = `${c.you ? "you" : ""} ${c.ranked ? "" : "unranked"}`;
        if (!c.ranked) tr.dataset.tipText = tip("unrankedRow", { n: c.rounds, min: s.minRounds });
        // the best round as a share of the starting money (the game ranks percentages, not yen); a career that never gained has none
        for (const v of [nameIn(c.name, c.draw), c.rounds, pts(c.average), c.best > 0 ? pct(c.best / s.start) : "—", c.wins, c.busts]) {
          const td = document.createElement("td");
          td.textContent = v;
          tr.append(td);
        }
        const trend = document.createElement("td");
        trend.append(spark(c.recent));
        tr.append(trend);
        tr.firstChild.prepend(avatar(c.face, 18));
        tr.tabIndex = 0;
        tr.onclick = tr.onkeydown = (e) => {
          if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
          famePick = c.name + (c.draw ?? "");
          fameChart(s);
        };
        return tr;
      }),
    );
    fameChart(s);
  }


  // After the bell the result stands in for the ticket, at its height.
  const bell = s.phase === "break" && !!s.result;
  if (bell && $("bell").hidden) {
    $("bell").style.height = `${document.querySelector(".ticket").offsetHeight}px`;
    $("debrief").open = false;
  }
  $("bell").hidden = !bell;
  document.body.classList.toggle("bell-up", bell);
  if (s.result) {
    $("reveal").textContent = reveal(s.result);
    const d = s.result.debrief;
    const details = $("debrief");
    details.hidden = !d;
    if (d) {
      $("debrief-score").textContent = pts(d.score);
      const lines = [
        [t("startingFunds"), yen(s.start)],
        [t("resultBeforeFees"), yen(d.beforeFees)],
        [t("financingPaid"), yen(-d.financing)],
        ...(d.interest ? [[t("interestPaid"), yen(-d.interest)]] : []),
        [t("netWorth"), yen(d.net)],
        [t("loansOwed"), yen(d.debt)],
        [t("returnPoints"), pts(d.returnPct)],
        ...(d.cuts ? [[t("cutPenalty", { n: d.cuts }), pts(-d.cutPenalty)]] : []),
        ...(d.bankruptPenalty ? [[t("bankruptPenalty"), pts(-d.bankruptPenalty)]] : []),
        ...(d.bonus ? [[t("yearBonus"), pts(d.bonus)]] : []),
        [t("finalScore"), pts(d.score)],
      ];
      $("debrief-lines").replaceChildren(...lines.map(([label, value]) => {
        const row = document.createElement("div");
        row.append(Object.assign(document.createElement("dt"), { textContent: label }), Object.assign(document.createElement("dd"), { textContent: value }));
        return row;
      }));
    }
    $("bell-next").textContent = t("bellNext", { s: s.breakLeft });
    $("ranking").replaceChildren(
      ...s.result.ranking.map((r) => {
        const li = document.createElement("li");
        li.className = `${r.you ? "you" : ""} ${r.sat ? "sat" : ""}`;
        // Rank, name and result on one row, as a column this narrow can hold.
        // Someone who sat the round out is listed after, without a rank.
        const delta = r.balance - s.start;
        const name = Object.assign(document.createElement("span"), { className: "who", textContent: `${botName(r.code, nameIn(r.name, r.draw))}${r.you ? ` ${t("youTag")}` : ""}` });
        const result = r.sat
          ? Object.assign(document.createElement("span"), { className: "res", textContent: t("satOut") })
          : Object.assign(document.createElement("span"), { className: `res ${delta >= 0 ? "up" : "down"}` });
        // The percentage first, as a trader reads it; the score, which ranks
        // the bell (ADR 0029), after it: lower than the percentage by the
        // cost of each forced cut and loan. The yen is in the tip.
        if (!r.sat) result.append(Object.assign(document.createElement("b"), { textContent: pct(delta / s.start) }), " ", Object.assign(document.createElement("small"), { className: "pts", textContent: pts(r.score) }));
        li.dataset.tipText = tip("rankRow", { worth: yen(r.balance), code: r.code, change: `${delta >= 0 ? "+" : ""}${yen(delta)}` }) + (r.bonus ? ` · ${t("bonus", { n: r.bonus })}` : "");
        // A replay guess, shown at the bell, a hit marked by its bonus.
        if (r.guess) name.append(" ", Object.assign(document.createElement("span"), { className: `guessed ${r.bonus ? "hit" : ""}`, textContent: t("guessed", { year: r.guess }) }));
        li.append(avatar(r.face, 18), name, result);
        return li;
      }),
    );
  }
  // Last, once every panel has shown or hidden what it will: the step looks at
  // what is on screen (ADR 0052).
  if (s.lesson) spotlight(s.lesson, s.phase === "moving");
  else clearPointer();
  blockStaleControls();
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
  connection(navigator.onLine === false ? "connectionOffline" : state ? "connectionReconnecting" : "connectionConnecting");
  heardAt = Date.now();
  clearPointer();
  shown = null;
  cuts = null;
  bankrupt = null;
  popped = null;
  dadAsked = false;
  $("error").textContent = "";
  const source = events = new EventSource(`/api/events?mode=${mode}`);
  source.onmessage = async (e) => {
    if (source !== events) return;
    try {
      await receive(JSON.parse(e.data), source);
    } catch {
      if (source === events) connection("connectionReconnecting");
    }
  };
  source.onerror = () => {
    if (source === events) connection(navigator.onLine === false ? "connectionOffline" : "connectionReconnecting");
  };
  source.addEventListener("heartbeat", () => {
    if (source === events) heardAt = Date.now();
  });
}
// A stream can hang without raising an error. Heartbeats arrive every five
// seconds, including idle rooms; three missed beats open a fresh stream.
setInterval(() => {
  if (Date.now() - heardAt > 15_000) watch(mode);
}, 1000);
addEventListener("offline", () => {
  events?.close();
  connection("connectionOffline");
});
addEventListener("online", () => watch(mode));
for (const tab of document.querySelectorAll("[role=tab]")) tab.onclick = () => tab.dataset.mode !== mode && watch(tab.dataset.mode);
translate();
label();
watch(mode);
connected = true;

// The bell's reveal in this language: the pair and dates, then the
// famous day hidden in it, if any. English is the server's own sentence.
function reveal(result) {
  if (lang === "en") return result.reveal;
  const f = result.facts;
  // A Scenario names its script, and the real market it was modelled on.
  if (f.simulated) {
    const x = f.scenario && T[lang].scenarios[f.scenario];
    return x ? t("revealSimulation", { name: x.name, pair: f.pair, date: f.from, note: x.note }) : t("revealSim", { pair: f.pair, date: f.from });
  }
  const said = t("revealReplay", { pair: f.pair, from: f.from, to: f.to });
  const e = f.event && T[lang].events[f.event.date];
  return e ? `${said} ${e.title}（${f.event.date}）：${e.note}` : said;
}
