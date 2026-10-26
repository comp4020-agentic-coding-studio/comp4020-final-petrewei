// The trading floor's page. The server owns everything; this page draws
// what it sends and posts the buttons. Elements are updated in place, so a
// click is never lost to a redraw.
const $ = (id) => document.getElementById(id);
import { LANGS, T, money, news, refusal } from "/i18n.js";
import { drawn } from "/names.js";
import { PEOPLE, svg } from "/avatars.js";
import { bollinger, closes, rsi, sma, stack } from "/indicators.js";
import { DISTANCES, STAKES, distAt, distPos, exitAt, exitPos, fillSpan, gauge, levAt, levPos, moveYen, pct } from "/ticket.js";
import { ICONS, prop } from "/art.js";
import { refresh as retip, useWords } from "/tips.js";

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
const tip = (k, vars = {}) => fill(T[lang].tips[k] ?? T.en.tips[k] ?? "", vars);
useWords((k) => tip(k));
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
const ROWS = { bot: { badge: "🤖", label: "bot" }, left: { badge: "🚪", label: "leftTag" }, wiped: { badge: "💀", label: "wipedTag" }, person: {} };
const nameOf = (code) => names.get(code) ?? botName(code, code);

// Every fixed string on the page carries data-t (its text), data-t-title
// (its tooltip) or data-t-label (a phone label). Switching language fills
// them again and redraws what the server last sent.
function translate() {
  document.documentElement.lang = lang === "zh" ? "zh-CN" : lang;
  for (const el of document.querySelectorAll("[data-t]")) el.textContent = t(el.dataset.t);
  for (const el of document.querySelectorAll("[data-t-label]")) el.dataset.label = t(el.dataset.tLabel);
  if ($("lev-ticks")) sliders();
  for (const el of document.querySelectorAll("[data-t-aria]")) el.setAttribute("aria-label", t(el.dataset.tAria));
  $("lang").value = $("n-lang").value = lang;
  $("borrow").replaceChildren(Object.assign(document.createElement("span"), { className: "art", innerHTML: prop("piggy", 22) }), t("borrow", { amount: money(lang, 300_000) }));
  retip();
  document.title = `${t("logo")}${t("titleJoin")}${t("sub")}`;
}
// Another language is another address. The market keeps running and the
// tab is remembered, so the page comes back to the same room.
for (const id of ["lang", "n-lang"]) $(id).onchange = () => location.assign(home($(id).value));

let state = null;
// Forced closes seen so far; a new one takes the screen.
let cuts = null;
// The last pop shown, by number; the first message's pops are old news.
let popped = null;
let lastPrice = null;
let fame = "";

// Leverage and stake are sliders that hold their choice (ADR 0024).
// Leverage runs on a log scale and snaps to the desk's ladder, its ends
// and the two legal caps marked; stake runs evenly. What a leverage means
// is said beside it, in the parody's voice.
const choice = { leverage: 25, stake: 1 };
let seated = false;
let ladder = [1, 2, 5, 10, 25, 30, 50, 100, 200, 500, 1000];
const RISKY = 100;
function ticks(id, marks) {
  $(id).replaceChildren(
    ...marks.map(([at, text, cls = ""]) => {
      const m = Object.assign(document.createElement("span"), { className: cls, textContent: text });
      m.style.left = `${at * 100}%`;
      return m;
    }),
  );
}
function sliders() {
  // Australia's cap, 30×, is marked on the track (ADR 0033).
  ticks("lev-ticks", [[0, "1×"], [levPos(30), t("capsTick"), "cap"], [1, "1000×"]]);
  ticks("stake-ticks", STAKES.map((v, i) => [i / (STAKES.length - 1), `${v * 100}%`]));
}
function mark() {
  $("leverage").value = String(Math.round(levPos(choice.leverage) * 1000));
  $("stake").value = String(STAKES.indexOf(choice.stake));
  $("lev-out").textContent = `${choice.leverage}×`;
  $("stake-out").textContent = `${choice.stake * 100}%`;
  $("leverage-box").classList.toggle("risky", choice.leverage >= RISKY);
  $("leverage").setAttribute("aria-valuetext", `${choice.leverage}×`);
  $("stake").setAttribute("aria-valuetext", `${choice.stake * 100}%`);
  $("lev-note").textContent = T[lang].ui.notes[choice.leverage] ?? "";
}
$("leverage").oninput = () => {
  choice.leverage = levAt(Number($("leverage").value) / 1000, ladder);
  mark();
  if (state) ticket(state);
};
// Let go, and the thumb settles on the rung it chose.
$("leverage").onchange = mark;
$("stake").oninput = () => {
  choice.stake = STAKES[Number($("stake").value)];
  mark();
  if (state) ticket(state);
};
sliders();
mark();
// The pixel props (ADR 0025), drawn once: they never change.
$("bell-art").innerHTML = prop("bell", 26);
$("paused-art").innerHTML = prop("pause", 64);
$("losscut-art").innerHTML = prop("skull", 72);
$("ironman-fist").innerHTML = prop("fist", 20);

// The market this page is on, from the tab: kept in this browser, so a
// reload, or a switch of language, returns to it.
const MODES = ["replay", "scenario", "tutorial"];
// The tabs' old names, History and Live, still lead to them (ADRs 0027, 0028).
const renamed = (m) => ({ history: "replay", live: "scenario" })[m] ?? m;
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
// An address may name a tab (/#scenario, or an old /#history); honour it,
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

async function act(kind, extra = {}) {
  $("error").textContent = "";
  const res = await fetch("/api/act", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, mode, ...extra }) });
  if (!res.ok) $("error").textContent = refusal(lang, (await res.json()).error ?? "Refused.");
}
// A stop loss and a take profit each ride on the order when their own
// toggle is on (ADR 0032, 0034); off, each is still shown, grey, and not sent.
const exits = { sl: { on: false, dist: 5 }, tp: { on: false, dist: 10 } };
const order = (kind) => () => act(kind, { leverage: choice.leverage, stake: choice.stake, sl: exits.sl.on ? exits.sl.dist : null, tp: exits.tp.on ? exits.tp.dist : null });
$("buy").onclick = order("buy");
$("sell").onclick = order("sell");
$("close").onclick = () => act("close");
// A round's controls (ADR 0022). Ending for everyone asks first.
$("cancel").onclick = () => act("cancel");
$("pause").onclick = () => act("pause");
// Name that year: one private guess, which may be changed until the bell.
$("guess-year").max = String(new Date().getFullYear());
$("guess").onsubmit = (e) => {
  e.preventDefault();
  act("guess", { year: Number($("guess-year").value) });
};
$("resume").onclick = () => act("resume");
$("leave").onclick = () => confirm(t("leaveConfirm")) && act("leave");
$("finish").onclick = () => confirm(t("finishConfirm")) && act("finish");
$("hold").onclick = () => act("hold");
$("dismiss").onclick = () => act("dismiss");
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
    const res = await fetch("/api/face", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ face: tryFace }) });
    const out = await res.json();
    if (!res.ok) return void ($("name-error").textContent = refusal(lang, out.error ?? "Refused."));
    myFace = out.face;
  }
  const res = await fetch("/api/name", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: $("name-input").value }) });
  const out = await res.json();
  if (!res.ok) return void ($("name-error").textContent = refusal(lang, out.error ?? "Refused."));
  me = nameIn(out.name, out.draw);
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
  $("lobby-title").textContent = counting ? t("lobbyOpens", { s: s.countdown }) : t(s.mode === "scenario" ? "lobbyScenario" : "lobbyReplay");
  $("lobby-text").textContent = counting ? t("lobbyCounting", { who: nameIn(s.startedBy, s.startedDraw) }) : t(s.mode === "scenario" ? "lobbyScenarioText" : "lobbyReplayText");
  $("start").hidden = counting;
}
$("restart").onclick = () => act("restart");

// The tutorial names the controls a lesson is about; the page highlights
// them.
const FOCUS = { chart: "chart", equity: "equity", pnl: "pnl-box", level: "level-box", leverage: "leverage-box", stake: "stake-box", buy: "buy", sell: "sell", close: "close", stop: "pexits", borrow: "borrow" };
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
  for (const k of ["sl", "tp"]) $(`${k}-dist`).value = String(Math.round(exitPos({ kind: k, dist: exits[k].dist }) * 1000));
  paintExits();
}
for (const k of ["sl", "tp"]) {
  $(`${k}-on`).onclick = () => {
    exits[k].on = !exits[k].on;
    paintExits();
  };
  $(`${k}-dist`).oninput = () => {
    exits[k].dist = exitAt(Number($(`${k}-dist`).value) / 1000).dist;
    // moving a thumb switches its own exit on: the point of moving it
    exits[k].on = true;
    paintExits();
  };
}
seatExits();
// The position's own two toggles and track (ADR 0037), the ticket's control
// bound to the open position: a toggle sets the exit at the distance shown or
// removes it, and letting go of a thumb places it. A held distance is kept per
// exit so the thumb stays where it was set while the price moves.
const held = { sl: 5, tp: 10 };
let grabbed = null;
function paintHeld(on) {
  for (const k of ["sl", "tp"]) {
    const [min, max] = HALF[k];
    if (grabbed !== k) $(`p${k}-dist`).value = String(Math.round(exitPos({ kind: k, dist: held[k] }) * 1000));
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
    held[k] = exitAt(Number($(`p${k}-dist`).value) / 1000).dist;
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
  const away = `${wipe < 1 ? wipe.toFixed(2) : wipe.toFixed(0)}%`;
  // Two short lines, each a whole phrase, so no line ends on a stray word:
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
        ? [t("previewOpen1"), t("previewOpen2")]
        : [t("previewNone"), ""];
  const slots = { margin: yen(margin), controls: yen(controls), away };
  $("preview-1").replaceChildren(...rich(one, slots));
  $("preview-2").replaceChildren(...rich(two, slots));
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
  const near = pos ? [pos.stop, pos.take, pos.call, pos.cut].filter((p) => p && Math.abs(p / prices.at(-1) - 1) < 0.03) : [];
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
  if (p.kind === "pray") return pick(T[lang].prayers);
  if (p.kind === "close") return `${p.pnl >= 0 ? "+" : ""}${yen(p.pnl)}${p.pnl > 0 ? " 💰" : p.pnl < 0 ? " 💸" : ""}`;
  return `${ICONS.pops[p.kind] ?? ""} ${(T[lang].pops[p.kind] ?? "").replaceAll("{lev}", String(p.lev ?? ""))}`.trim();
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
  const open = tutorial ? s.phase === "waiting" && !s.lesson.finished : s.phase === "trade" || s.phase === "countdown";
  // Leave is for anyone still in a running round; End is the starter's.
  const running = !tutorial && (s.phase === "trade" || s.phase === "countdown");
  $("round-ctl").hidden = !running || s.you.left;
  $("finish").hidden = !(s.phase === "trade" && s.rules);
  // Pause: anyone may, in a trading round that isn't ironman; a pause veils
  // the chart for everyone, with the seconds until it resumes by itself.
  $("pause").hidden = !(s.phase === "trade" && !s.ironman && !s.paused);
  // Name that year opens halfway through a replay; your guess is shown
  // back to you, and to nobody else, until the bell.
  const guessing = s.mode === "replay" && s.phase === "trade" && s.tick >= s.total / 2 && !s.you.left;
  $("guess").hidden = !guessing;
  $("guess").classList.toggle("made", s.you.guess !== null);
  if (guessing && s.you.guess !== null && document.activeElement !== $("guess-year")) $("guess-year").value = String(s.you.guess);
  if (!guessing && s.phase !== "trade") $("guess-year").value = "";
  $("paused").hidden = tutorial || !s.paused;
  if (s.paused) $("paused-title").textContent = t("pausedTitle", { s: s.paused });
  document.body.classList.toggle("tutorial", tutorial);
  lesson(s);
  lobby(s);
  // The tab shows a head count as a bare number; its tooltip says what.
  for (const m of ["replay", "scenario"]) {
    $(`here-${m}`).textContent = s.here[m] ? String(s.here[m]) : "";
    setTip(document.querySelector(`[data-mode="${m}"]`), `${tip(m === "scenario" ? "tabScenario" : "tabReplay")}${s.here[m] ? ` · ${t(s.here[m] === 1 ? "human" : "humans", { n: s.here[m] })}` : ""}`);
  }
  names = new Map(s.traders.map((tr) => [tr.id, tr.bot ? botName(tr.id, tr.name) : nameIn(tr.name, tr.draw)]));
  // On first load the menu starts at the open position's leverage, if
  // any, so a reload shows what the player chose.
  if (!seated) {
    seated = true;
    ladder = s.leverages;
    choice.leverage = levAt(levPos(s.you.pos?.leverage ?? 25), ladder);
    mark();
  }
  const price = s.prices.at(-1);
  const first = s.prices[0];
  $("pair").textContent = s.pair;
  $("price").textContent = price.toFixed(s.digits);
  const ch = (price / first - 1) * 100;
  $("change").textContent = `${ch >= 0 ? "+" : ""}${ch.toFixed(2)}%`;
  $("change").className = ch >= 0 ? "up" : "down";
  // A Scenario's latest headline takes the mode line, so the clue stays
  // in view after the feed has moved on (ADR 0027).
  const head = s.headline && (s.headline.scenario ? T[lang].scenarios[s.headline.scenario]?.headlines[s.headline.n] : T[lang].clues[s.headline.date]?.[s.headline.n]);
  $("mode").textContent = head ? `📰 ${head}` : t(tutorial ? "modeTutorial" : s.simulated ? "modeScenario" : "modeReplay");
  $("mode").classList.toggle("headline", !!head);
  setTip($("mode"), head ?? "");
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
  myFace = s.you.face;
  // Your code tells you apart from a namesake; it lives in the tip, so
  // the line keeps its room for the name.
  $("whoami").replaceChildren(avatar(s.you.face, 18), strong(me), Object.assign(document.createElement("span"), { className: "pencil", textContent: "✎", ariaHidden: "true" }));
  setTip($("whoami"), tip("whoami", { code: s.you.code }));
  if (!s.you.named && !welcomed) {
    welcomed = true;
    openNames(true);
  }
  draw(s);
  ticket(s);

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
  $("pnl").className = tone(y.pnl);
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
  for (const [id, share] of [["mark-call", 0.5], ["mark-cut", 0.2]]) {
    const show = !!y.pos && open;
    $(id).hidden = !show;
    // Level is equity over margin, so at a level the equity is that share of it.
    if (show) $(id).style.left = `${gauge((share * y.pos.margin - y.debt) / s.start) * 100}%`;
  }
  $("borrow").hidden = !(y.broke && y.loansLeft > 0 && s.phase === "trade" && !y.left);
  warn(s, open);
  // Your position: one row with its own close and stop, as on any
  // platform, or a line saying what to do when there is none.
  $("pos-row").hidden = !y.pos;
  $("pos-empty").hidden = !!y.pos;
  $("pos-exits").hidden = !y.pos;
  if (y.pos) {
    const side = Object.assign(document.createElement("span"), { className: `tag ${y.pos.side === 1 ? "long" : "short"}`, textContent: y.pos.side === 1 ? t("long") : t("short") });
    $("pos-side").replaceChildren(side, ` ${s.pair} ${y.pos.leverage}×`);
    $("pos-entry").textContent = y.pos.entry.toFixed(s.digits);
    $("pos-now").textContent = price.toFixed(s.digits);
    $("pos-margin").textContent = yen(y.pos.margin);
    $("pos-pnl").textContent = yen(y.pnl);
    $("pos-pnl").className = y.pnl > 0 ? "up" : y.pnl < 0 ? "down" : "";
    // An exit set elsewhere (an order's, a bot's) shows at its distance now.
    for (const [k, at] of [["sl", y.pos.stop], ["tp", y.pos.take]]) {
      if (at && grabbed !== k) held[k] = exitAt(exitPos({ kind: k, dist: Math.abs((at / price - 1) * 100) })).dist;
    }
    paintHeld({ sl: !!y.pos.stop, tp: !!y.pos.take });
  } else {
    $("position").textContent = t(y.left ? "leftText" : y.broke && y.loansLeft > 0 ? "broke" : y.out ? "wiped" : open ? "noPos" : "noPosClosed");
  }
  if (y.debt) $("position").textContent += t("owe", { amount: yen(y.debt) });
  const closed = !open || y.out || y.left || !!s.paused;
  for (const id of ["buy", "sell"]) $(id).disabled = closed;
  $("pray").disabled = closed || s.phase === "countdown";
  for (const id of ["close", "psl-on", "ptp-on", "psl-dist", "ptp-dist"]) $(id).disabled = closed || !y.pos;

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

  const humans = s.traders.filter((t) => !t.bot).length;
  $("count").textContent = t(humans === 1 ? "human" : "humans", { n: humans });
  const list = $("traders");
  list.replaceChildren(
    ...s.traders.map((tr) => {
      const li = document.createElement("li");
      li.className = `${tr.you ? "you" : ""} ${tr.out && !tr.left ? "out" : ""} ${tr.left ? "gone" : ""}`;
      const n = document.createElement("span");
      n.className = "n";
      n.textContent = names.get(tr.id) + (tr.you ? ` ${t("youTag")}` : "");
      // A small badge says what a word would: a bot, gone, or wiped out;
      // the tip says the rest, so the row keeps its room for the name.
      const kind = tr.bot ? "bot" : tr.left ? "left" : tr.out ? "wiped" : "person";
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
  $("feed").replaceChildren(
    ...talk,
    ...s.feed.map((f) => {
      const li = document.createElement("li");
      li.className = `k-${f.kind}`;
      // Each line wears its kind's icon, so a glance tells a win from a cut.
      li.append(Object.assign(document.createElement("span"), { className: "ico", textContent: ICONS.news[f.key.replace(/^you-/, "")] ?? "·", ariaHidden: "true" }), news(lang, f, nameOf));
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
        // Ranked by average score once a trader has played enough rounds;
        // newer traders are listed after, unranked (ADR 0029).
        tr.className = `${c.you ? "you" : ""} ${c.ranked ? "" : "unranked"}`;
        if (!c.ranked) tr.dataset.tipText = tip("unrankedRow", { n: c.rounds, min: s.minRounds });
        for (const v of [nameIn(c.name, c.draw), c.rounds, pts(c.average), yen(c.profit), c.wins, c.busts]) {
          const td = document.createElement("td");
          td.textContent = v;
          tr.append(td);
        }
        tr.firstChild.prepend(avatar(c.face, 18));
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
        li.className = `${r.you ? "you" : ""} ${r.sat ? "sat" : ""} ${r.left ? "left" : ""}`;
        // Rank, name and result on one row, as a column this narrow can hold.
        // Someone who sat the round out is listed after, without a rank.
        const delta = r.balance - s.start;
        const name = Object.assign(document.createElement("span"), { className: "who", textContent: `${botName(r.code, nameIn(r.name, r.draw))}${r.you ? ` ${t("youTag")}` : ""}` });
        const result = r.sat || r.left
          ? Object.assign(document.createElement("span"), { className: "res", textContent: t(r.left ? "leftTag" : "satOut") })
          : Object.assign(document.createElement("span"), { className: `res ${delta >= 0 ? "up" : "down"}` });
        // The percentage first, as a trader reads it; the score, which ranks
        // the bell (ADR 0029), after it: lower than the percentage by the
        // cost of each forced cut and loan. The yen is in the tip.
        if (!(r.sat || r.left)) result.append(Object.assign(document.createElement("b"), { textContent: pct(delta / s.start) }), " ", Object.assign(document.createElement("small"), { className: "pts", textContent: pts(r.score) }));
        li.dataset.tipText = tip("rankRow", { worth: yen(r.balance), code: r.code, change: `${delta >= 0 ? "+" : ""}${yen(delta)}` }) + (r.bonus ? ` · ${t("bonus", { n: r.bonus })}` : "");
        // A replay guess, shown at the bell, a hit marked by its bonus.
        if (r.guess) name.append(" ", Object.assign(document.createElement("span"), { className: `guessed ${r.bonus ? "hit" : ""}`, textContent: t("guessed", { year: r.guess }) }));
        li.append(avatar(r.face, 18), name, result);
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
connected = true;

// The bell's reveal in this language: the pair and dates, then the
// famous day hidden in it, if any. English is the server's own sentence.
function reveal(result) {
  if (lang === "en") return result.reveal;
  const f = result.facts;
  // A Scenario names its script, and the real market it was modelled on.
  if (f.simulated) {
    const x = f.scenario && T[lang].scenarios[f.scenario];
    return x ? t("revealScenario", { name: x.name, pair: f.pair, date: f.from, note: x.note }) : t("revealSim", { pair: f.pair, date: f.from });
  }
  const said = t("revealReplay", { pair: f.pair, from: f.from, to: f.to });
  const e = f.event && T[lang].events[f.event.date];
  return e ? `${said} ${e.title}（${f.event.date}）：${e.note}` : said;
}
