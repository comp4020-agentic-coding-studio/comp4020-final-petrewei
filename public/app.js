import { makeAction, sendAction } from "/requests.js";
import { createTransport } from "/transport.js";
import { createChart } from "/chart.js";
import { createTutorial } from "/tutorial-ui.js";
import { createAccountPanel } from "/account.js";
// The trading floor's page. The server owns everything; this page draws
// what it sends and posts the buttons. Elements are updated in place, so a
// click is never lost to a redraw.
const $ = (id) => document.getElementById(id);
import { LANGS, T, clueText, money, news, refusal, releaseName, releaseText } from "/i18n.js";
import { drawn } from "/names.js";
import { PEOPLE, svg } from "/avatars.js";
import { PERIODS, bollinger, closes, rsi, sma, spanIn, spanOf, stack } from "/indicators.js";
import { place, windowed } from "/view.js";
import { SHARES, exitAt, exitPos, feePerDay, fillSpan, gauge, hue, levAt, levHeat, levPos, movePerPct, pct, shareBar, shareMargin, verdict } from "/ticket.js";
import { ICONS, prop } from "/art.js";
import { clauses } from "/clauses.js";
import { quoted, sydneyTime, tone } from "/format.js";
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
const cash = (n) => money(lang, n);
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
// A definition with the broker's numbers in it fills them from the state, so it never keeps a copy (ADR 0085).
useInfo((k) => fill(T[lang].info[k] ?? T.en.info[k] ?? "", k === "credit" ? creditSlots() : {}));
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
const nameOf = (code, line) => names.get(code) ?? (line?.name ? nameIn(line.name, line.draw >= 0 ? line.draw : null) : botName(code, code));

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
  // the row's button is words alone, no art, so the row holds what is owed, the rate and the button on one line, as the
  // position's empty line does
  $("credit-borrow").textContent = t("borrow", { amount: money(lang, broker.step) });
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
let connectionTimer = null;
const marketControls = ["buy", "sell", "pend-place", "pend-cancel", "pend-row-cancel", "close", "mobile-close", "warn-close", "psl-on", "ptp-on", "psl-dist", "ptp-dist", "start", "cancel", "pause", "resume", "finish", "hold", "dismiss", "borrow", "credit-borrow", "credit-repay", "pray-rise", "pray-fall", "rewind-pair", "pair-base", "pair-quote", "guess-year", "lesson-play", "lesson-stop", "lesson-skip", "lesson-back"];
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
// Whether the player was bankrupt in the last state, so the stamp shows once as it begins; null before the first state.
let bankrupt = null;
// The last pop shown, by number; the first message's pops are old news.
let popped = null;
let lastPrice = null;
let fame = "";
// the closed trades last drawn, so the list is rebuilt only when it changes
let historyShown = "";
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

// Leverage and margin are sliders that hold their choice (ADR 0024).
// Leverage runs on a log scale and snaps to the desk's ladder, its ends
// and the two legal caps marked; margin runs evenly. What a leverage means
// is said beside it, in the parody's voice.
// a new order starts at the legal cap and a quarter of the account, a stake a beginner can lose and play on
const choice = { leverage: 30, share: 0.25 };
let seated = false;
// The desk's rules, set by the first state: the ladder, the legal cap, the fee and the
// amount the emergency credit offers, so the page keeps no copy of them.
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
  // each share marked at its share of the account, the scale the track's bar is drawn on (ADR 0077)
  ticks("margin-ticks", SHARES.map((v, i) => [v, `${v * 100}%`, "", ui.marginNotes[i]]));
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
  $("margin").value = String(SHARES.indexOf(choice.share));
  $("lev-out").textContent = `${choice.leverage}×`;
  $("margin-out").textContent = `${choice.share * 100}%`;
  // A leverage over the cap says so in the note's colour too, and the page
  // marks the box, so a style can tell a legal choice from an offshore one.
  $("leverage-box").style.setProperty("--heat", hue(levHeat(choice.leverage, broker.cap, ladder.at(-1))));
  $("leverage-box").classList.toggle("offshore", choice.leverage > broker.cap);
  $("margin-box").style.setProperty("--heat", hue(0.1 + 0.55 * ((SHARES.indexOf(choice.share) + 1) / SHARES.length)));
  $("leverage").setAttribute("aria-valuetext", `${choice.leverage}×`);
  $("margin").setAttribute("aria-valuetext", `${choice.share * 100}%`);

  for (const el of $("lev-ticks").children) el.classList.toggle("on", el.classList.contains(`rung-${choice.leverage}`));
  for (const [i, el] of [...$("margin-ticks").children].entries()) el.classList.toggle("on", i === SHARES.indexOf(choice.share));
  leverageNote();
  // The lit step moves on the moment a slider reaches the value it was asked for.
  if (state?.lesson) spotlight(state.lesson, state.phase === "moving");
}
// Live remembers the leverage and margin last set on each pair (ADR 0095), in this browser, so moving between pairs
// keeps each one's; a round's pair is fixed for the round, so it needs none. Storage may be refused: then nothing is kept.
const PAIR_CHOICES = "pairChoices";
function rememberChoice() {
  if (state?.mode !== "live") return;
  try {
    const kept = JSON.parse(localStorage.getItem(PAIR_CHOICES) ?? "{}");
    kept[state.pair] = { leverage: choice.leverage, share: choice.share };
    localStorage.setItem(PAIR_CHOICES, JSON.stringify(kept));
  } catch {
    // a private window keeps no choices
  }
}
// The choice kept for a pair, if any, set on the sliders; true when there was one.
function recallChoice(pair) {
  try {
    const kept = JSON.parse(localStorage.getItem(PAIR_CHOICES) ?? "{}")[pair];
    if (!kept || !ladder.includes(kept.leverage) || !SHARES.includes(kept.share)) return false;
    choice.leverage = kept.leverage;
    choice.share = kept.share;
    mark();
    return true;
  } catch {
    return false;
  }
}
$("leverage").oninput = () => {
  choice.leverage = ladder[Number($("leverage").value)];
  mark();
  rememberChoice();
  if (state) (ticket(state), pending(state));
};
// Let go, and the thumb settles on the rung it chose.
$("leverage").onchange = mark;
$("margin").oninput = () => {
  choice.share = SHARES[Number($("margin").value)];
  mark();
  rememberChoice();
  if (state) (ticket(state), pending(state));
};
// The pixel props (ADR 0025), drawn once: they never change.
$("bell-art").innerHTML = prop("bell", 26);
$("paused-art").innerHTML = prop("pause", 64);
$("losscut-art").innerHTML = prop("skull", 72);
$("ironman-fist").innerHTML = prop("fist", 20);

// The market this page is on, from the tab: kept in this browser, so a
// reload, or a switch of language, returns to it.
const MODES = ["rewind", "random", "live", "tutorial"];
// The tabs' old names still lead to them (ADR 0091), from an address or a tab saved in this browser: the ids before the
// tabs were renamed, replay, simulation and marathon; the names before those, History, Scenario, Flashback and
// Sandbox. The tabs' own ids, rewind, random and live, are their player-facing names.
const renamed = (m) => ({ replay: "rewind", simulation: "random", marathon: "live", history: "rewind", scenario: "random", flashback: "rewind", sandbox: "random" })[m] ?? m;
let mode = (() => {
  try {
    // a browser that remembers a tab by an old name lands on its new one
    const saved = renamed(localStorage.getItem("tab"));
    if (MODES.includes(saved)) return saved;
  } catch {
    // no storage: start on Rewind
  }
  return "rewind";
})();
// An address may name a tab (/#random, or an old name such as /#simulation); honour it,
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
    const res = url === "/api/act" ? await sendAction(makeAction(body.mode, body.kind, body)) : await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
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
  const source = transport.source;
  // in Live an order is for the pair on the chart (ADR 0087)
  const reply = await post("/api/act", { kind, mode, ...(mode === "live" && state?.pair && !extra.pair ? { pair: state.pair } : {}), ...extra });
  if (source === transport.source) $("error").textContent = reply.why;
}
// A stop loss and a take profit each ride on the order when their own
// toggle is on (ADR 0032, 0034); off, each is still shown, grey, and not sent.
const exits = { sl: { on: false, dist: 5 }, tp: { on: false, dist: 10 } };
const order = (kind) => () => act(kind, { leverage: choice.leverage, share: choice.share, sl: exits.sl.on ? exits.sl.dist : null, tp: exits.tp.on ? exits.tp.dist : null });
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
$("pend-place").onclick = () => act("pend", { side: pend.side, at: pend.at, leverage: choice.leverage, share: choice.share, sl: exits.sl.on ? exits.sl.dist : null, tp: exits.tp.on ? exits.tp.dist : null });
$("pend-cancel").onclick = $("pend-row-cancel").onclick = () => act("unpend");
// A round's controls (ADR 0022). Ending for everyone asks first.
$("cancel").onclick = () => act("cancel");
$("pause").onclick = () => act("pause");
$("speed").onclick = () => act(state?.speed === 2 ? "normal" : "fast");
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
// A trader's achievements in the dialog (ADRs 0082, 0084, 0085): the server sends the names earned, and the dialog lists
// every one with what it takes, the earned ones ticked first, and a bar for how far along. Anyone's, opened from their
// row in the hall, or your own from the hall's heading.
function showFeats(name, list) {
  const earned = new Set(list);
  const all = Object.keys(T.en.ui.feats);
  $("feats-who").textContent = name === null ? t("featsMine") : t("featsOf", { name });
  $("feats-count").textContent = t("featsCount", { n: earned.size, of: all.length });
  $("feat-bar").style.width = `${(earned.size / all.length) * 100}%`;
  const words = T[lang].ui.feats ?? T.en.ui.feats;
  const order = [...all.filter((f) => earned.has(f)), ...all.filter((f) => !earned.has(f))];
  $("feat-list").replaceChildren(...order.map((f) => {
    const li = document.createElement("li");
    li.className = earned.has(f) ? "got" : "open";
    li.append(Object.assign(document.createElement("b"), { textContent: words[f][0] }), Object.assign(document.createElement("span"), { textContent: words[f][1] }));
    return li;
  }));
  if (!$("feats").open) $("feats").showModal();
}
function feats(s) {
  const n = (s.you.feats ?? []).length;
  $("feats-mine-n").textContent = n ? String(n) : "";
}
$("feats-mine").onclick = () => state && showFeats(null, state.you.feats ?? []);
$("feats-close").onclick = () => $("feats").close();

// The daily rate on a debt, by the broker's tiers (ADR 0080); an upper bound of null is the last tier.
const creditRate = (debt) => (broker.tiers.find(([upTo]) => upTo === null || debt <= upTo) ?? broker.tiers.at(-1))[1];
const ratePct = (r) => `${+(r * 100).toFixed(2)}%`;
// the credit's tiers for its definition: each daily rate, and the debt each runs to
function creditSlots() {
  const [one, two, three] = broker.tiers;
  return { t1: ratePct(one?.[1] ?? 0), t2: ratePct(two?.[1] ?? 0), t3: ratePct(three?.[1] ?? 0), a1: money(lang, one?.[0] ?? 0), a2: money(lang, two?.[0] ?? 0) };
}
// Emergency credit is drawn from its row any time, or from a pop-up once a player is cut out or broke, which closes
// once it is (ADR 0080).
$("credit-borrow").onclick = () => act("borrow");
$("credit-repay").onclick = () => act("repay");
$("borrow").onclick = () => {
  act("borrow");
  creditOffered = true;
  $("credit-offer").close();
};
$("credit-offer-no").onclick = () => {
  creditOffered = true;
  $("credit-offer").close();
};
let creditOffered = false;

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

// Settings (ADR 0083, 0085), each kept in this browser: sound effects, off until chosen, made in the page with no
// files, and a calm screen, the page's own reduced-motion rules on demand. Music and the theme keep their own buttons.
const prefs = (() => {
  try {
    return { sound: false, calm: false, ...JSON.parse(localStorage.getItem("prefs") ?? "{}") };
  } catch {
    return { sound: false, calm: false };
  }
})();
const savePrefs = () => {
  try {
    localStorage.setItem("prefs", JSON.stringify(prefs));
  } catch {
    // a private window: the choice lasts this visit
  }
};
const showPrefs = () => {
  $("set-sound").setAttribute("aria-checked", String(prefs.sound));
  $("set-calm").setAttribute("aria-checked", String(prefs.calm));
  document.documentElement.classList.toggle("calm", prefs.calm);
};
showPrefs();
for (const k of ["sound", "calm"]) $(`set-${k}`).onclick = () => {
  prefs[k] = !prefs[k];
  savePrefs();
  showPrefs();
  if (k === "sound" && prefs.sound) sound("fill");
};
$("settings-btn").onclick = () => $("settings").showModal();
$("settings-close").onclick = () => $("settings").close();
// A short tone for a moment: a click for a fill, a two-note chime for a profit, a low thud for a forced cut, a buzz
// for a margin call. Made with the page's own audio, so nothing is fetched, and only once a player has turned it on.
let audio = null;
const TONES = { fill: [[880, 0.05]], win: [[660, 0.08], [990, 0.12]], cut: [[110, 0.35]], call: [[220, 0.12], [220, 0.12]] };
function sound(kind) {
  if (!prefs.sound) return;
  try {
    audio ??= new AudioContext();
    let at = audio.currentTime;
    for (const [freq, len] of TONES[kind]) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = kind === "cut" ? "triangle" : "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.12, at);
      gain.gain.exponentialRampToValueAtTime(0.001, at + len);
      osc.connect(gain).connect(audio.destination);
      osc.start(at);
      osc.stop(at + len);
      at += len + 0.03;
    }
  } catch {
    // no audio here; the game is the same without it
  }
}

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
  const show = open && pos && (calling || near) && shows(s).warn;
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
  $("lobby").hidden = !shows(s).lobby || !waiting;
  if (!waiting) return;
  const counting = s.phase === "countdown";
  $("lobby").classList.toggle("counting", counting);
  $("cancel").hidden = !(counting && s.rules);
  $("ironman").hidden = counting;
  $("lobby-title").textContent = counting ? String(s.countdown) : t(s.mode === "random" ? "lobbyRandom" : "lobbyRewind");
  $("lobby-text").textContent = counting ? t("lobbyCounting", { who: nameIn(s.startedBy, s.startedDraw) }) : t(s.mode === "random" ? "lobbyRandomText" : "lobbyRewindText");
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
  // Live's pair is the account's to switch at any time (ADR 0087), with the same two menus as Random's lobby
  const { pairMenus, plotMenu, pairLive } = shows(s);
  $("pair").hidden = pairMenus || plotMenu;
  $("pair-controls").hidden = !pairMenus;
  $("rewind-pair").hidden = !plotMenu;
  // a round's pair is chosen in the lobby; Live's at any time
  const closed = (!pairLive && s.phase !== "lobby") || !fresh;
  for (const id of ["rewind-pair", "pair-base", "pair-quote"]) $(id).disabled = closed;
  if (s.rewindPlots) {
    const sel = $("rewind-pair");
    if (sel.options.length !== s.rewindPlots.length) sel.replaceChildren(...s.rewindPlots.map((p) => Object.assign(document.createElement("option"), { value: String(p.n), textContent: `${p.pair} · ${String(p.n).padStart(2, "0")}` })));
    if (document.activeElement !== sel) sel.value = String(s.rewindPlot);
  }
  if (pairMenus && s.pairs) {
    const [base, quote] = s.pair.split("/");
    options("pair-base", [...new Set(s.pairs.map((p) => p.split("/")[0]))], base);
    options("pair-quote", s.pairs.filter((p) => p.startsWith(`${base}/`)).map((p) => p.split("/")[1]), quote);
  }
}
$("rewind-pair").onchange = async () => {
  await act("choose", { what: Number($("rewind-pair").value) });
  if (state) pairChoices(state);
};
async function choosePair() {
  const offered = state?.pairs?.filter((p) => p.startsWith(`${$("pair-base").value}/`)) ?? [];
  const pair = offered.find((p) => p.endsWith(`/${$("pair-quote").value}`)) ?? offered[0];
  if (!pair) return;
  options("pair-quote", offered.map((p) => p.split("/")[1]), pair.split("/")[1]);
  await (mode === "live" ? act("pair", { pair }) : act("choose", { what: pair }));
  if (state) pairChoices(state);
}
$("pair-base").onchange = $("pair-quote").onchange = choosePair;
const tutorialUI = createTutorial({ getState: () => state, getMode: () => mode, getChoice: () => choice, getLadder: () => ladder, getLanguage: () => lang, isFresh: () => fresh, act, t });
const { lesson, spotlight, clearPointer } = tutorialUI;
// The chart redraws when its box changes size (a window resized, a panel folded, a position row appearing), since it
// is drawn to the box (ADR 0076).
// The header's height, for the first screen's sizing (ADR 0076): it changes with the language and wraps at some
// widths, so it is measured, not assumed. Where the browser has no ResizeObserver (an old one, or the checks' own
// page), a window resize does both jobs.
const header = document.querySelector("header.top");
const measureHead = () => header && document.documentElement.style.setProperty("--head", `${header.offsetHeight}px`);
measureHead();
if (typeof ResizeObserver === "function") {
  if (header) { const observer = new ResizeObserver(measureHead); observer.observe(header); addEventListener("pagehide", (event) => { if (!event.persisted) observer.disconnect(); }); }
} else addEventListener("resize", measureHead);

// The ticket's two toggles and one joined track (ADR 0034): the stop loss
// toggle on the left and the take profit toggle on the right, a thumb each,
// held to its own half so the two never cross. Each shows its percentage
// only, grey while its own toggle is off. The fills are drawn here, since a
// slider paints to the left of its thumb, wrong for the stop loss.
const HALF = { sl: [0, 480], tp: [520, 1000] };
// Both tracks paint the same control: the ticket's ("sl", "tp") and the position's ("psl", "ptp"), each in its own panel.
function paintExit(prefix, kind, distance, on) {
  const id = `${prefix}${kind}`;
  const [min, max] = HALF[kind];
  const { from, to } = fillSpan(kind, Number($(`${id}-dist`).value), min, max);
  // the stop loss's half is the left 48% of the track, the take profit's the right 48%
  const left = kind === "sl" ? 0 : 52;
  $(`${id}-fill`).style.left = `${left + from * 48}%`;
  $(`${id}-fill`).style.width = `${(to - from) * 48}%`;
  $(`${id}-pct`).textContent = `${distance}%`;
  $(`${id}-on`).setAttribute("aria-checked", String(on));
  $(`${prefix}exits`).querySelector(".exit-track").dataset[kind] = String(on);
}
function paintExits() {
  for (const k of ["sl", "tp"]) paintExit("", k, exits[k].dist, exits[k].on);
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
    if (grabbed !== k) $(`p${k}-dist`).value = String(Math.round(exitPos({ kind: k, dist: held[k] }, broker.distances) * 1000));
    paintExit("p", k, held[k], on[k]);
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

// The leverage's note: how far against you takes everything you put in, at L× a move of 1/L, and the holding cost,
// which grows with the square of the leverage (ADR 0058, 0085).
function leverageNote() {
  const wipe = 100 / choice.leverage;
  const away = `${wipe < 1 ? wipe.toFixed(2) : wipe.toFixed(0)}%`;
  $("fee-note").textContent = t("levNote", { away, pct: feePerDay(broker.fee, choice.leverage, state?.dayTicks ?? 96) });
}
// The ticket: the prices a sell and a buy fill at, and what the chosen
// order would put up, worked out from the account the server sent.
function ticket(s) {
  $("bid").textContent = s.prices.length ? quoted(s.bid) : "—";
  $("ask").textContent = s.prices.length ? quoted(s.ask) : "—";
  $("spread").textContent = s.prices.length ? t("spread", { pips: ((s.ask - s.bid) / s.pip).toFixed(1) }) : "—";
  // the desk's own rule, from the module both share
  const used = s.you.used ?? 0;
  const margin = shareMargin(s.you.equity, used, choice.share);
  // the margin's track as the whole account: what is in use, and what this order would add after it (ADR 0077)
  const bar = shareBar(s.you.equity, used, choice.share);
  $("margin-used").style.width = `${bar.used * 100}%`;
  $("margin-order").style.left = `${bar.used * 100}%`;
  $("margin-order").style.width = `${bar.order * 100}%`;
  $("margin-box").classList.toggle("cut", bar.cut && !s.you.out);
  // beside the margin, what this order puts in and what each 1% the price moves makes or loses (ADRs 0079, 0095)
  $("margin-note").textContent = t("marginNote", { margin: cash(margin), move: cash(movePerPct(margin, choice.leverage)) });
  // The preview's row is gone (ADR 0085): what a move against you costs joins the leverage's note, and with a position
  // open the opposite button says it closes it, where it would otherwise say what it earns on.
  const pos = s.you.pos;
  for (const [id, side, note] of [["sell", -1, "sellNote"], ["buy", 1, "buyNote"]]) {
    $(id).querySelector("small").textContent = pos && pos.side !== side ? t("closesIt") : pos && margin > 0 ? t("addsTo") : t(note);
  }
  leverageNote();
}
// Live's other open pairs (ADR 0087): each with its side, leverage, result and its own Close; clicking a pair puts
// it on the chart. The chart's own pair is the position row above.
function book(s) {
  const rows = shows(s).book ? s.you.positions.filter((p) => p.pair !== s.pair) : [];
  $("book").hidden = !rows.length;
  $("book-rows").replaceChildren(...rows.map((p) => {
    const tr = document.createElement("tr");
    const side = Object.assign(document.createElement("span"), { className: `tag ${p.side === 1 ? "long" : "short"}`, textContent: p.side === 1 ? t("long") : t("short") });
    const go = Object.assign(document.createElement("button"), { type: "button", className: "linkish", textContent: ` ${p.pair} ${p.leverage}×` });
    go.dataset.tipText = t("showPair", { pair: p.pair });
    go.onclick = () => act("pair", { pair: p.pair });
    const shut = Object.assign(document.createElement("button"), { type: "button", className: "mini", textContent: t("close") });
    shut.onclick = () => act("close", { pair: p.pair });
    shut.disabled = !p.live;
    const cells = [[side, go], quoted(p.entry), quoted(p.now), cash(p.margin), cash(p.pnl), pct(p.pnl / p.margin), [shut]];
    for (const [i, c] of cells.entries()) {
      const td = document.createElement("td");
      if (Array.isArray(c)) td.append(...c);
      else td.textContent = c;
      if (i === 4 || i === 5) td.className = tone(p.pnl);
      tr.append(td);
    }
    return tr;
  }));
}
// Live's market headlines: the stories after the one pinned over the chart, each the outlet's own words, linked, with
// its source and how long ago; they turn over as the server's feed refreshes.
function marketNews(s) {
  const items = s.mode === "live" ? s.marketNews ?? [] : [];
  $("market-news").hidden = !items.length;
  $("market-news-list").replaceChildren(...items.map((n) => {
    const li = document.createElement("li");
    const a = Object.assign(document.createElement("a"), { href: n.link, target: "_blank", rel: "noopener noreferrer", textContent: n.title });
    li.append(a, Object.assign(document.createElement("small"), { textContent: ` ${n.source} · ${sydneyTime(n.at, lang)}` }));
    return li;
  }));
}
// Live's real calendar (ADR 0087): this week's high-impact releases for the seven currencies, at Sydney time, with
// the forecast and, once out, the actual figure, as the calendar's source gives them; then the central banks' latest
// words, each a link to the bank's own page. The titles are the sources' own, in English.
function realCalendar(s) {
  const on = shows(s).realCalendar;
  const rows = on ? s.calendar ?? [] : [];
  const banks = on ? s.bankNews ?? [] : [];
  $("real-calendar").hidden = !rows.length && !banks.length;
  const when = (at) => sydneyTime(at, lang);
  $("real-calendar").replaceChildren(
    ...rows.map((c) => {
      const li = document.createElement("li");
      li.className = c.actual ? "told" : c.at < Date.now() ? "told" : "upcoming";
      const figures = [c.actual && t("calActual", { v: c.actual }), c.forecast && t("calForecast", { v: c.forecast }), c.previous && t("calPrevious", { v: c.previous })].filter(Boolean).join(" · ");
      li.append(Object.assign(document.createElement("span"), { className: "when", textContent: when(c.at) }), Object.assign(document.createElement("span"), { className: "what", textContent: `${c.cur} · ${c.title}${figures ? ` · ${figures}` : ""}` }));
      return li;
    }),
    ...banks.slice(0, 4).map((b) => {
      const li = document.createElement("li");
      li.className = "bank";
      const a = Object.assign(document.createElement("a"), { href: b.link, target: "_blank", rel: "noopener noreferrer", textContent: `${b.cur} · ${b.source}: ${b.title}` });
      li.append(Object.assign(document.createElement("span"), { className: "when", textContent: when(b.at) }), Object.assign(document.createElement("span"), { className: "what" }));
      li.lastChild.append(a);
      return li;
    }),
  );
}
// Live's price alerts (ADR 0095): a level on the chart's pair, typed and set; the server tells you alone when the price
// reaches it. Each alert listed with a cancel, the chart's pair or another.
function alerts(s) {
  const on = s.mode === "live" && !s.you.out;
  $("alerts").hidden = !on;
  if (!on) return;
  if (document.activeElement !== $("alert-at") && !$("alert-at").value) $("alert-at").placeholder = s.prices.length ? quoted(s.prices.at(-1)) : "";
  $("alert-list").replaceChildren(...(s.you.alerts ?? []).map((x) => {
    const li = document.createElement("li");
    const cancel = Object.assign(document.createElement("button"), { type: "button", className: "mini", textContent: t("pendCancel") });
    cancel.onclick = () => act("unalert", { pair: x.pair, at: x.at });
    li.append(`${x.pair} ${x.above ? "≥" : "≤"} ${quoted(x.at)} `, cancel);
    return li;
  }));
}
$("alerts").onsubmit = (e) => {
  e.preventDefault();
  const at = Number($("alert-at").value);
  if (!(at > 0)) return;
  act("alert", { at });
  $("alert-at").value = "";
};

// Live's board in the room's place (ADR 0087): who lasted longest, running or bankrupt.
function board(s) {
  const on = shows(s).board;
  $("board").hidden = !on;
  $("traders").hidden = on;
  // your run, while your account is open: the day it is on, today's change so far, and yesterday's with its trades
  const y = s.you;
  $("run").hidden = !on || y.out || !y.days;
  if (on && !y.out && y.days) {
    const signed = (n) => `${n >= 0 ? "+" : ""}${cash(n)}`;
    const parts = [t("runDay", { n: y.days })];
    if (y.today !== null && y.today !== undefined) parts.push(t("runToday", { change: signed(y.today) }));
    if (y.yesterday) parts.push(t("runYesterday", { change: signed(y.yesterday.change), n: y.yesterday.trades }));
    $("run").textContent = parts.join(" · ");
  }
  if (!on) return;
  $("board").replaceChildren(...(s.board ?? []).map((r) => {
    const li = document.createElement("li");
    li.className = `${r.you ? "you" : ""} ${r.how}`;
    li.append(avatar(r.face, 18), strong(nameIn(r.name, r.draw)), Object.assign(document.createElement("span"), { className: "aside", textContent: `${r.days} · ${t(r.how === "running" ? "boardRunning" : "boardBust")} · ${cash(r.worth)}` }));
    li.dataset.tipText = t("boardPeak", { peak: cash(r.peak) });
    return li;
  }));
}
// The pending row: what this order would be as a pending one, or what is waiting, with a Cancel (ADR 0078).
function pending(s) {
  const ui = T[lang].ui;
  const waiting = s.you.pending;
  const typeName = (type) => ui.pendTypes?.[type] ?? T.en.ui.pendTypes[type];
  $("pend-cancel").hidden = !waiting;
  $("pend-waiting").textContent = waiting ? t("pendWaiting", { type: typeName(waiting.type), at: quoted(waiting.at) }) : "";
  const price = s.prices.at(-1);
  if (price !== undefined) $("pend-at").step = String(10 ** -(quoted(price).split(".")[1]?.length ?? 0));
  const share = `${Math.round(choice.share * 100)}%`;
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

const accountPanel = createAccountPanel({ root: document, cash });
const chart = createChart({ getState: () => state, getLanguage: () => lang, t });
const draw = chart.draw;

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
  if (said) return p.kind === "close" ? `${said} ${p.pnl >= 0 ? "+" : ""}${cash(p.pnl)}` : said;
  if (p.kind === "pray") return pick(T[lang].prayers[p.way === -1 ? "fall" : "rise"]);
  if (p.kind === "close") return `${p.pnl >= 0 ? "+" : ""}${cash(p.pnl)}${p.pnl > 0 ? " 💰" : p.pnl < 0 ? " 💸" : ""}`;
  return `${ICONS.pops[p.kind] ?? ""} ${(T[lang].pops[p.kind] ?? "").replaceAll("{lev}", String(p.lev ?? ""))}`.trim();
}
// Where a pop shows: over the trader's row in the room, or, for your own,
// over the control you used, since your row may be off screen.
function popAt(p, s) {
  if (p.who === s.you.code) {
    if (p.kind === "pray") return $(p.way === -1 ? "pray-fall" : "pray-rise");
    if (p.kind === "close") return $("pnl-box");
    if (p.kind === "call" || p.kind === "stopout" || p.kind === "zerocut") return $("level-box");
    // over the credit block it came from, not the panel's heading
    if (p.kind === "borrow") return $("credit-borrow");
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
      // your own moments have a sound, when sound is on (ADR 0083)
      if (p.who === s.you.code) sound(p.kind === "close" ? (p.pnl > 0 ? "win" : "fill") : p.kind === "call" ? "call" : p.kind === "stopout" || p.kind === "zerocut" ? "cut" : "fill");
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

function headlineText(head) {
  if (!head) return head;
  if (head.source) return `${head.source}: ${head.title}`;
  if (head.release) return releaseText(lang, "release", head.release);
  if (head.story !== undefined) return T[lang].stories[head.story];
  if (head.situation) return T[lang].situations[head.situation]?.headlines[head.n];
  return clueText(lang, head.clue, head.n);
}

// What each tab shows, in one place, so the parts of the page ask for a feature, not a tab: a lobby to start a round
// from; the plot menu or the pair menus, and whether a pair can be changed during play; the year to guess; Live's
// open pairs, board and real calendar; a round's own calendar; the margin warning; a head count of people on the tab
// rather than in the room. Layout is the page's: the server's rules are what it sends.
const SHOWS = {
  rewind: { lobby: true, plotMenu: true, pairMenus: false, pairLive: false, guess: true, book: false, board: false, realCalendar: false, calendar: true, warn: true, tabCount: false },
  random: { lobby: true, plotMenu: false, pairMenus: true, pairLive: false, guess: false, book: false, board: false, realCalendar: false, calendar: true, warn: true, tabCount: false },
  live: { lobby: false, plotMenu: false, pairMenus: true, pairLive: true, guess: false, book: true, board: true, realCalendar: true, calendar: false, warn: true, tabCount: true },
  tutorial: { lobby: false, plotMenu: false, pairMenus: false, pairLive: false, guess: false, book: false, board: false, realCalendar: false, calendar: false, warn: false, tabCount: false },
};
const shows = (s) => SHOWS[s.mode] ?? SHOWS.rewind;

// The bell's "what if" (ADR 0095): the round's biggest trade at 1x, 30x and 1000x, each with what it would have made
// or lost, the leverage you used marked, and a leverage stopped out on the way said so.
function whatIf(w) {
  $("what-if").hidden = !w;
  if (!w) return;
  $("what-if-rows").replaceChildren(...w.at.map((x) => {
    const li = document.createElement("li");
    li.className = `${x.pnl >= 0 ? "up" : "down"}${x.leverage === w.leverage ? " yours" : ""}`;
    const result = `${x.pnl >= 0 ? "+" : ""}${cash(x.pnl)}`;
    li.append(Object.assign(document.createElement("b"), { textContent: `${x.leverage}×` }), Object.assign(document.createElement("span"), { textContent: x.stoppedOut ? t("whatIfStopped", { pnl: result }) : result }));
    if (x.leverage === w.leverage) li.append(Object.assign(document.createElement("em"), { textContent: t("whatIfYours") }));
    return li;
  }));
}

// What the position's line says with nothing open: in Live, whether the account is closed until midnight, the market
// is shut or waiting for history, or another pair is open; in a round or the tutorial, whether the player is broke, out,
// or simply has nothing open. Debt is added after, in every mode.
function emptyLine(s, open) {
  const y = s.you;
  if (s.mode === "live") {
    if (y.out) return t("liveClosed", { at: s.reopens ? sydneyTime(s.reopens, lang) : "—" });
    if (!s.live) return s.historyGap ? t("liveGap") : s.opens ? t("liveOpens", { at: sydneyTime(s.opens, lang) }) : t("liveShut");
    return t(y.positions.length ? "liveOther" : "noPos");
  }
  return t(y.broke && y.credit > 0 ? "broke" : y.out ? "wiped" : open ? "noPos" : "noPosClosed");
}

// The pair Live's chart showed last, so a change of pair brings back the choice kept for the new one.
let livePair = null;
function render(s) {
  state = s;
  if (s.mode === "live" && seated && s.pair !== livePair) {
    livePair = s.pair;
    if (recallChoice(s.pair)) ticket(s);
  } else if (s.mode !== "live") livePair = null;
  const tutorial = s.mode === "tutorial";
  // Whether orders are taken now: a round's trading, or a tutorial whose
  // price is standing still for the player's move.
  const open = tutorial ? s.phase === "waiting" && !s.lesson.finished : s.phase === "trade" || s.phase === "countdown";
  document.body.classList.toggle("live", s.mode === "live");
  // End is the starter's, in a trading round.
  $("finish").hidden = !(s.phase === "trade" && s.rules);
  // 2× (ADR 0085): the ruler's to press; when it is on, everyone sees the lit button, pressable or not
  const fast = s.speed === 2;
  $("speed").hidden = !(s.phase === "trade" && (s.rules || fast));
  $("speed").disabled = !s.rules;
  $("speed").setAttribute("aria-pressed", String(fast));
  $("speed").dataset.tip = fast ? "speedDown" : "speedUp";
  // Pause: anyone may, in a trading round that isn't ironman; a pause veils
  // the chart for everyone, with the seconds until it resumes by itself.
  $("pause").hidden = !(s.phase === "trade" && !s.ironman && !s.paused);
  $("round-ctl").hidden = ["speed", "pause", "finish"].every((id) => $(id).hidden);
  // Name that year opens halfway through a rewind; your guess is shown
  // back to you, and to nobody else, until the bell.
  const guessing = shows(s).guess && s.phase === "trade" && s.tick >= s.total / 2;
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
  for (const m of ["rewind", "random", "live"]) {
    $(`here-${m}`).textContent = s.here[m] ? String(s.here[m]) : "";
    setTip(document.querySelector(`[data-mode="${m}"]`), `${tip(m === "random" ? "tabRandom" : m === "live" ? "tabLive" : "tabRewind")}${s.here[m] ? ` · ${t(s.here[m] === 1 ? "human" : "humans", { n: s.here[m] })}` : ""}`);
  }
  names = new Map(s.traders.map((tr) => [tr.id, tr.bot ? botName(tr.id, tr.name) : nameIn(tr.name, tr.draw)]));
  // On first load the menu starts at the open position's leverage, if
  // any, so a reload shows what the player chose.
  broker = s.desk;
  if (!seated) {
    seated = true;
    ladder = s.leverages;
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
  $("price").textContent = price === undefined ? "—" : quoted(price);
  const ch = price === undefined ? 0 : (price / first - 1) * 100;
  $("change").textContent = price === undefined ? "" : pct(ch / 100);
  $("change").className = ch >= 0 ? "up" : "down";
  // A Situation's latest headline takes the mode line, so the clue stays
  // in view after the feed has moved on (ADR 0027).
  const head = headlineText(s.headline);
  // Only a clue or headline is shown here; the static label that said which
  // mode this was is gone (ADR 0059), since the tab already says it.
  $("mode").textContent = head ? `📰 ${head}` : "";
  $("mode").hidden = !head;
  setTip($("mode"), head ?? "");
  // Which clock is the server's; the page fills in its numbers. The day counts days of `dayTicks` ticks; the hour is
  // the game's hour of the trading day, never the replay's own time of day (ADR 0079); Live's is Sydney's time of its
  // last price (ADR 0087).
  const clock = s.clock.key;
  const clockValues = { at: s.clock.at ? sydneyTime(s.clock.at, lang) : "—", d: Math.max(1, Math.ceil(s.tick / s.dayTicks)), of: Math.max(1, Math.round(s.total / s.dayTicks)), h: Math.floor((((s.tick - 1 + s.dayTicks) % s.dayTicks) * 24) / s.dayTicks), s: s.countdown };
  $("clock").textContent = t(`${clock}Short`, clockValues);
  const clockLabel = t(clock, clockValues);
  $("clock").setAttribute("aria-label", clockLabel);
  setTip($("clock"), clockLabel);
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
  accountPanel.render(s, open);
  // Emergency credit (ADR 0080): its row says what is owed and at what daily rate, the rate the next step would cost
  // when nothing is owed; a pop-up offers a step to a player cut out or broke, while the round trades (the tutorial,
  // whenever the price stands still).
  // whether credit can be drawn now is the server's call, made beside the rule that refuses it
  const lending = !!y.lending;
  $("credit-owe").textContent = y.debt ? cash(y.debt) : t("creditFree");
  // how much of the line is drawn, as a bar
  $("credit-used").style.width = `${Math.min(100, (y.debt / (broker.limit || 1)) * 100)}%`;
  $("credit-owe").classList.toggle("owing", y.debt > 0);
  // a day's rate, and the same over a year, simply, so a player sees what it would cost a real borrower
  const rate = creditRate(y.debt || broker.step);
  $("credit-rate").textContent = t("creditRate", { rate: ratePct(rate), year: `${Math.round(rate * 365 * 100)}%` });
  $("credit-borrow").disabled = !lending || !!s.paused || y.credit <= 0;
  $("credit-repay").disabled = !lending || !!s.paused || !y.debt;
  const offer = y.broke && y.credit > 0 && lending && !s.paused;
  $("borrow").hidden = !offer;
  if (!offer) {
    creditOffered = false;
    if ($("credit-offer").open) $("credit-offer").close();
  } else if (!creditOffered && !$("credit-offer").open && !document.querySelector("dialog[open]:not(#credit-offer)")) {
    $("credit-offer-text").textContent = t("creditOfferText", { amount: cash(broker.step), rate: ratePct(creditRate(y.debt + broker.step)) });
    $("credit-offer").show();
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
    $("pos-margin").textContent = cash(y.pos.margin);
    // the row's own result, which the server sends with the position in every mode: in Live it is one pair of several
    const rowPnl = y.pos.pnl ?? y.pnl;
    $("pos-pnl").textContent = cash(rowPnl);
    $("pos-pnl").className = tone(rowPnl);
    // the return on the margin is what the game ranks by, so it is the row's loudest figure
    $("pos-pct").textContent = pct(rowPnl / y.pos.margin);
    $("pos-pct").className = `pct-big ${tone(rowPnl)}`;
    $("pos-exit").textContent = `${y.pos.stop ? quoted(y.pos.stop) : "—"} / ${y.pos.take ? quoted(y.pos.take) : "—"}`;
    $("pos-cut").textContent = y.pos.cut ? quoted(y.pos.cut) : "—";
    // An exit set elsewhere (an order's, a bot's) shows at its distance now.
    for (const [k, at] of [["sl", y.pos.stop], ["tp", y.pos.take]]) {
      if (at && grabbed !== k) held[k] = exitAt(exitPos({ kind: k, dist: Math.abs((at / price - 1) * 100) }, broker.distances), broker.distances).dist;
    }
    paintHeld({ sl: !!y.pos.stop, tp: !!y.pos.take });
  } else $("position").textContent = emptyLine(s, open);
  if (y.debt) $("position").textContent += t("owe", { amount: cash(y.debt) });
  const waiting = y.pending;
  $("pend-row").hidden = !waiting;
  if (waiting) {
    const typeName = T[lang].ui.pendTypes?.[waiting.type] ?? T.en.ui.pendTypes[waiting.type];
    $("pend-row-type").replaceChildren(Object.assign(document.createElement("span"), { className: `tag ${waiting.side === 1 ? "long" : "short"}`, textContent: typeName }), ` ${s.pair} ${waiting.leverage}×`);
    $("pend-row-at").textContent = quoted(waiting.at);
    $("pend-row-what").textContent = t("pendRow", { share: `${Math.round(waiting.share * 100)}%` });
  }
  feats(s);
  book(s);
  alerts(s);
  // This round's closed trades, newest first, each with its verdict (ADR 0081); hidden until there is one. The list is
  // rebuilt only when it changes, so an open row's place under the reader's cursor is kept.
  const trades = y.trades ?? [];
  $("history").hidden = !trades.length;
  const traded = JSON.stringify(trades) + lang;
  if (traded !== historyShown) {
    historyShown = traded;
    $("history-count").textContent = t("historyCount", { n: trades.length });
    const ui = T[lang].ui;
    $("history-rows").replaceChildren(...trades.map((tr) => {
      const row = document.createElement("tr");
      const side = Object.assign(document.createElement("span"), { className: `tag ${tr.side === 1 ? "long" : "short"}`, textContent: tr.side === 1 ? t("long") : t("short") });
      const cells = [[side, ` ${tr.pair ?? s.pair} ${tr.leverage}×`], quoted(tr.entry), quoted(tr.exit), ui.how?.[tr.how] ?? T.en.ui.how[tr.how], cash(tr.pnl), pct(tr.pct), (ui.verdicts ?? T.en.ui.verdicts)[verdict(tr.how, tr.pct)]];
      cells.forEach((c, i) => {
        const td = document.createElement("td");
        if (Array.isArray(c)) td.append(...c);
        else td.textContent = c;
        if (i === 4 || i === 5) td.className = tone(tr.pnl);
        if (i === 6) td.className = "verdict";
        row.append(td);
      });
      return row;
    }));
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
  $("mobile-pnl").textContent = cash(y.pnl);
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

  board(s);
  const humans = shows(s).tabCount ? s.here.live : s.traders.filter((t) => !t.bot).length;
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
      // another person in a round's room can be challenged to a duel over the round (ADR 0095): click their row
      const duelWith = s.duel && "with" in s.duel ? s.duel.with : null;
      if (duelWith === tr.id) n.append(" ", Object.assign(document.createElement("span"), { className: "badge", textContent: "⚔", ariaLabel: t("duelBadge") }));
      if (!tr.you && !tr.bot && shows(s).lobby && s.phase !== "break" && !duelWith) {
        li.classList.add("challengeable");
        li.dataset.tipText += ` · ${t("duelOffer")}`;
        // a control a keyboard reaches too, as every control must be: focus, then Enter or Space
        li.tabIndex = 0;
        li.setAttribute("role", "button");
        li.onclick = li.onkeydown = (e) => {
          if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          act("challenge", { code: tr.id });
        };
      }
      return li;
    }),
  );
  // a challenge made to you, with its Accept, or the duel you are in
  const duel = s.duel;
  $("duel").hidden = !duel;
  if (duel) {
    const other = "with" in duel ? duel.with : duel.from;
    $("duel-text").textContent = t("with" in duel ? "duelOn" : "duelFrom", { who: nameOf(other) });
    $("duel-accept").hidden = "with" in duel;
    $("duel-accept").onclick = () => act("accept", { code: other });
  }
  if (price !== undefined) effects(s, price);
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
  // The economic calendar over the feed (ADR 0085): each release, its time, and how it came out once it has.
  const cal = shows(s).calendar ? s.calendar ?? [] : [];
  marketNews(s);
  realCalendar(s);
  $("calendar").hidden = !cal.length;
  $("calendar").replaceChildren(...cal.map((c) => {
    const li = document.createElement("li");
    li.className = c.outcome ? `told ${c.outcome}` : "upcoming";
    const when = Object.assign(document.createElement("span"), { className: "when", textContent: t("calWhen", { d: c.d, h: c.h }) });
    const what = Object.assign(document.createElement("span"), { className: "what", textContent: c.outcome ? releaseText(lang, "release", c) : `${c.cur} · ${releaseName(lang, c.kind)}` });
    // told: an arrow for what it did to its own currency, which way the pair goes being the reader's to work out
    if (c.outcome) what.prepend(Object.assign(document.createElement("span"), { className: "cal-mark", textContent: c.outcome === "strong" ? "▲" : c.outcome === "weak" ? "▼" : "■" }));
    li.append(when, what);
    return li;
  }));
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
        // the best round as a share of the starting money (the game ranks percentages, not dollars); a career that never gained has none
        for (const v of [nameIn(c.name, c.draw), c.rounds, pts(c.average), c.best > 0 ? pct(c.best / s.start) : "—", c.wins, c.busts]) {
          const td = document.createElement("td");
          td.textContent = v;
          tr.append(td);
        }
        const trend = document.createElement("td");
        trend.append(spark(c.recent));
        tr.append(trend);
        // the trader's medals, a button that opens their achievements for anyone to see (ADR 0085)
        const medals = document.createElement("td");
        const open = Object.assign(document.createElement("button"), { type: "button", className: "medals", textContent: `🏅 ${c.feats.length}` });
        open.setAttribute("aria-label", t("featsOpen", { name: nameIn(c.name, c.draw), n: c.feats.length, of: Object.keys(T.en.ui.feats).length }));
        open.onclick = (e) => {
          e.stopPropagation();
          showFeats(nameIn(c.name, c.draw), c.feats);
        };
        medals.append(open);
        tr.append(medals);
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
    // a picture only of a round you traded in
    $("share").hidden = !d;
    if (d) {
      $("debrief-score").textContent = pts(d.score);
      const lines = [
        [t("startingFunds"), cash(s.start)],
        [t("resultBeforeFees"), cash(d.beforeFees)],
        [t("financingPaid"), cash(-d.financing)],
        ...(d.interest ? [[t("interestPaid"), cash(-d.interest)]] : []),
        [t("netWorth"), cash(d.net)],
        [t("loansOwed"), cash(d.debt)],
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
    whatIf(d?.whatIf ?? null);
    // your duel's outcome, under the reveal (ADR 0095)
    const mine = s.result.duels?.find((x) => x.you);
    $("duel-result").hidden = !mine;
    if (mine) {
      const other = mine.a === s.you.code ? mine.b : mine.a;
      $("duel-result").textContent = t(mine.winner === null ? "duelDrew" : mine.winner === s.you.code ? "duelWon" : "duelLost", { who: nameOf(other) });
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
        // cost of each forced cut and loan. The amount is in the tip.
        if (!r.sat) result.append(Object.assign(document.createElement("b"), { textContent: pct(delta / s.start) }), " ", Object.assign(document.createElement("small"), { className: "pts", textContent: pts(r.score) }));
        li.dataset.tipText = tip("rankRow", { worth: cash(r.balance), code: r.code, change: `${delta >= 0 ? "+" : ""}${cash(delta)}` }) + (r.bonus ? ` · ${t("bonus", { n: r.bonus })}` : "");
        // A rewind guess, shown at the bell, a hit marked by its bonus.
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
const transport = createTransport({ onState: render, onConnection: connection, reconnect: watch });
function watch(next) {
  mode = next;
  try {
    localStorage.setItem("tab", mode);
  } catch {
    // a private window: the tab lasts this visit
  }
  for (const tab of document.querySelectorAll("[role=tab]")) tab.setAttribute("aria-selected", String(tab.dataset.mode === mode));
  clearPointer();
  cuts = null;
  bankrupt = null;
  popped = null;
  creditOffered = false;
  $("error").textContent = "";
  transport.start(mode);
}
for (const tab of document.querySelectorAll("[role=tab]")) tab.onclick = () => tab.dataset.mode !== mode && watch(tab.dataset.mode);
addEventListener("pagehide", (event) => {
  clearTimeout(connectionTimer);
  if (event.persisted) { transport.suspend(); clearPointer(); return; }
  transport.dispose(); chart.dispose(); tutorialUI.dispose();
});
addEventListener("pageshow", (event) => { if (event.persisted) watch(mode); });
translate();
label();
watch(mode);
connected = true;

// The bell's reveal in this language: the pair and dates, then the
// famous day hidden in it, if any. English is the server's own sentence.
// A picture of the round, saved from the bell (ADR 0083): the result as a share of the start, the score and the rank,
// what the round was (shown only after the bell, so it gives nothing away), and the account through the round's closed
// trades as a line. Drawn in the page from what it already has, and saved to the player's own device; nothing is sent.
function shareCard(s) {
  const r = s.result;
  const d = r.debrief;
  const mine = r.ranking.find((x) => x.you);
  if (!d || !mine) return;
  const css = getComputedStyle(document.documentElement);
  const c = document.createElement("canvas");
  const [W, H] = [720, 420];
  [c.width, c.height] = [W * 2, H * 2];
  const g = c.getContext("2d");
  g.scale(2, 2);
  g.fillStyle = css.getPropertyValue("--panel");
  g.fillRect(0, 0, W, H);
  g.fillStyle = css.getPropertyValue("--pink");
  g.fillRect(0, 0, W, 6);
  const ink = css.getPropertyValue("--ink");
  const muted = css.getPropertyValue("--muted");
  const round = css.getPropertyValue("--round") || "sans-serif";
  const mono = "'JetBrains Mono', ui-monospace, monospace";
  g.fillStyle = css.getPropertyValue("--pink");
  g.font = `800 28px ${round}`;
  g.fillText(t("logo"), 32, 52);
  g.fillStyle = muted;
  g.font = `14px ${round}`;
  g.fillText(`${t("shareTitle")} · ${me}`, 32, 78);
  const change = d.net / s.start - 1;
  g.fillStyle = css.getPropertyValue(change >= 0 ? "--up" : "--down");
  g.font = `800 64px ${mono}`;
  g.fillText(pct(change), 32, 160);
  g.fillStyle = ink;
  g.font = `600 18px ${mono}`;
  g.fillText(`${t("shareScore")} ${pts(d.score)}`, 32, 194);
  g.fillText(t("shareRank", { n: r.ranking.indexOf(mine) + 1, of: r.ranking.length }), 32, 220);
  // the account after each closed trade, from the start, as a line on the right
  const trades = [...(s.you.trades ?? [])].reverse();
  const path = [s.start];
  for (const tr of trades) path.push(path.at(-1) + tr.pnl);
  path.push(d.net);
  const [bx, by, bw, bh] = [380, 100, 300, 130];
  const lo = Math.min(...path, s.start);
  const hi = Math.max(...path, s.start);
  const py = (v) => by + bh - ((v - lo) / (hi - lo || 1)) * bh;
  g.strokeStyle = css.getPropertyValue("--line");
  g.beginPath();
  g.moveTo(bx, py(s.start));
  g.lineTo(bx + bw, py(s.start));
  g.stroke();
  g.strokeStyle = css.getPropertyValue(change >= 0 ? "--up" : "--down");
  g.lineWidth = 3;
  g.beginPath();
  path.forEach((v, i) => (i ? g.lineTo(bx + (i / (path.length - 1)) * bw, py(v)) : g.moveTo(bx, py(v))));
  g.stroke();
  // what the round was, wrapped to the card
  g.fillStyle = ink;
  g.font = `14px ${round}`;
  const words = reveal(r).split(/(?<=\s)|(?<=[、。，．])/);
  let line = "";
  let y = 280;
  for (const w of words) {
    if (g.measureText(line + w).width > W - 64 && line) {
      g.fillText(line.trim(), 32, y);
      line = "";
      y += 20;
      if (y > H - 50) break;
    }
    line += w;
  }
  if (y <= H - 50) g.fillText(line.trim(), 32, y);
  g.fillStyle = muted;
  g.font = `12px ${round}`;
  g.fillText(t("shareFoot"), 32, H - 20);
  c.toBlob((blob) => {
    if (!blob) return;
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `losscut-${s.mode}.png` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
}
$("share").onclick = () => state?.result && shareCard(state);

function reveal(result) {
  if (lang === "en") return result.reveal;
  const f = result.facts;
  // A Situation names its script, and the real market it was modelled on.
  if (f.simulated) {
    const x = f.situation && T[lang].situations[f.situation];
    return x ? t("revealRandom", { name: x.name, pair: f.pair, date: f.from, note: x.note }) : t("revealSim", { pair: f.pair, date: f.from });
  }
  const said = t("revealRewind", { pair: f.pair, from: f.from, to: f.to });
  const e = f.event && T[lang].events[f.event.date];
  return e ? `${said} ${e.title}（${f.event.date}）：${e.note}` : said;
}
