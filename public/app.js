// The trading floor's page. The server owns everything; this page draws
// what it sends and posts the buttons. Elements are updated in place, so a
// click is never lost to a redraw.
const $ = (id) => document.getElementById(id);
import { LANGS, T, money, news, refusal } from "/i18n.js";

// The page's language: chosen in the top bar and kept in this browser,
// else the browser's own if it is Japanese or Chinese, else English.
const guess = () => {
  const l = (navigator.language || "en").slice(0, 2);
  return LANGS.includes(l) ? l : "en";
};
let lang = (() => {
  try {
    const saved = localStorage.getItem("lang");
    if (LANGS.includes(saved)) return saved;
  } catch {
    // no storage: use the browser's language
  }
  return guess();
})();
// A slot not given here is left as {slot}, for rich() to fill as bold.
const t = (k, vars = {}) => (T[lang].ui[k] ?? T.en.ui[k]).replace(/\{(\w+)\}/g, (slot, v) => (v in vars ? String(vars[v]) : slot));
const yen = (n) => money(lang, n);
// A trader's name in this language: a character's in the page's script,
// a person's as the server made it, found by short code.
const botName = (id, fallback) => T[lang].bots[id]?.name ?? fallback;
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
  document.title = lang === "en" ? "Losscut! Kurumi's FX Fantasy" : `Losscut! ${t("sub")}`;
}
$("lang").onchange = () => {
  lang = $("lang").value;
  try {
    localStorage.setItem("lang", lang);
  } catch {
    // a private window: the choice lasts this visit
  }
  translate();
  label();
  fame = "";
  if (state) {
    mark();
    render(state);
  }
};

let state = null;
// Forced closes seen so far; a new one takes the screen.
let cuts = null;
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

// The market this page is on, from the tab, kept in the address so a
// shared link or a reload opens the same one.
const MODES = ["history", "live", "tutorial"];
let mode = MODES.includes(location.hash.slice(1)) ? location.hash.slice(1) : "history";

async function act(kind, extra = {}) {
  $("error").textContent = "";
  const res = await fetch("/api/act", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, mode, ...extra }) });
  if (!res.ok) $("error").textContent = refusal(lang, (await res.json()).error ?? "Refused.");
}
const order = (kind) => () => act(kind, { leverage: choice.leverage, stake: choice.stake });
$("buy").onclick = order("buy");
$("sell").onclick = order("sell");
$("close").onclick = () => act("close");
$("pray").onclick = () => act("pray");
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

// The lobby: a market waits for someone on the tab to press Start, then
// counts down so others can join.
function lobby(s) {
  const waiting = s.phase === "lobby" || s.phase === "countdown";
  $("lobby").hidden = s.mode === "tutorial" || !waiting;
  if (!waiting) return;
  const counting = s.phase === "countdown";
  $("lobby-title").textContent = counting ? t("lobbyOpens", { s: s.countdown }) : t(s.mode === "live" ? "lobbyLive" : "lobbyHistory");
  $("lobby-text").textContent = counting ? t("lobbyStarted", { who: s.startedBy }) : t(s.mode === "live" ? "lobbyLiveText" : "lobbyHistoryText");
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
  if (pos) level(pos.entry, pos.side === 1 ? up : down, `${pos.side === 1 ? t("long") : t("short")} ${pos.leverage}×`);
  if (pos?.stop) level(pos.stop, css.getPropertyValue("--call"), t("thStop"));
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
  // The tab shows a head count as a bare number; its tooltip says what.
  for (const m of ["history", "live"]) {
    $(`here-${m}`).textContent = s.here[m] ? String(s.here[m]) : "";
    $(`here-${m}`).title = s.here[m] ? t(s.here[m] === 1 ? "human" : "humans", { n: s.here[m] }) : "";
  }
  names = new Map(s.traders.map((tr) => [tr.id, tr.bot ? botName(tr.id, tr.name) : tr.name]));
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
  $("title").textContent = tutorial ? "chart_practice.exe" : s.simulated ? "chart_live_sim.exe" : "chart_replay_????-??-??.exe";
  $("clock").textContent = tutorial
    ? t("clockTutorial")
    : s.phase === "trade"
      ? t("clockDay", { d: Math.max(1, Math.ceil(s.tick / s.steps)), of: s.total / s.steps })
      : s.phase === "countdown"
        ? t("clockOpens", { s: s.countdown })
        : t(s.phase === "lobby" ? "clockLobby" : "clockClosed");
  // Built from text nodes: the name comes from the server, never as HTML.
  $("whoami").replaceChildren(`${t("youAre")} `, strong(s.you.name), " ", Object.assign(document.createElement("code"), { textContent: s.you.code }));
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
      li.append(n, p, e);
      return li;
    }),
  );
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
    $("reveal").textContent = reveal(s.result);
    $("bell-next").textContent = t("bellNext", { s: s.breakLeft });
    $("ranking").replaceChildren(
      ...s.result.ranking.map((r) => {
        const li = document.createElement("li");
        if (r.you) li.className = "you";
        const delta = r.balance - s.start;
        li.textContent = `${botName(r.code, r.name)}${r.you ? ` ${t("youTag")}` : ""}: ${yen(r.balance)} (${delta >= 0 ? "+" : ""}${yen(delta)})`;
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
