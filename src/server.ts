// Losscut!'s server: two shared markets, History and Scenario, each traded
// live by everyone on that tab, plus seven house bots in each. The server
// owns the price, fills every order at the price when it arrives, and
// enforces margin calls and stop-outs; pages only show what it sends (ADR
// 0010). A round is three minutes: History replays real days with the
// date hidden, Scenario plays a hidden script from today's rate. The hall of fame,
// across both, is kept on the volume.
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import { type Action, BOTS } from "./bots.ts";
import { BORROW, Desk, type Fill, LEVERAGES, LOANS, quote, START } from "./fx.ts";
import { ABOUT } from "../public/about.js";
import { PEOPLE } from "../public/avatars.js";
import { yen } from "../public/format.js";
import { LANGS as LANG_LIST, T } from "../public/i18n.js";
import { drawn, FAMILY, GIVEN } from "../public/names.js";
import { renderMarkdown } from "./markdown.ts";
import { History, PAIRS, STEPS, random, replay, scenario, type Pair, type Round } from "./market.ts";
import { LESSONS, type Move, Tutorial } from "./tutorial.ts";

const PORT = Number(process.env.PORT ?? 8080);
const DATA_DIR = process.env.DATA_DIR ?? "/data";
const ROOT = join(import.meta.dirname, "..");
const CAREER_FILE = join(DATA_DIR, "career.json");
const NAMES_FILE = join(DATA_DIR, "names.json");
const FACES_FILE = join(DATA_DIR, "faces.json");
const ACTIVITY = join(DATA_DIR, "activity.log");
// Half a second a tick: forty days of nine ticks is three minutes.
const TICK_MS = Number(process.env.TICK_MS ?? 500);
// A pop lasts about four seconds on the wire; a busy room keeps 40.
const POP_TICKS = 8;
const POPS_MAX = 40;
// The bell shows for twenty seconds; anyone on the tab may close it or
// hold it thirty more, up to five minutes in all (ADR 0022).
const BREAK_TICKS = 40;
const HOLD_TICKS = Math.round(30_000 / TICK_MS);
const BREAK_MAX = Math.round(300_000 / TICK_MS);
// After Start, five seconds for others on the tab to join, and to place
// an order at the opening price, before the price moves.
const COUNTDOWN_TICKS = Number(process.env.COUNTDOWN_TICKS ?? 10);
// A pause halts the price and the orders for everyone; anyone on the tab
// may pause or resume, and a pause ends by itself after a minute so
// nobody can hold a room (ADR 0024). An ironman round cannot pause.
const PAUSE_TICKS = Number(process.env.PAUSE_TICKS ?? Math.round(60_000 / TICK_MS));
// A bet this big is the room's business: a red feed line and a bubble.
const WILD = 200;
mkdirSync(DATA_DIR, { recursive: true });

const read = (file: string): string => readFileSync(join(ROOT, file), "utf8");
const history = new History(read("data/ecb.csv"));

// A visitor is their cookie; others see them by a trader name drawn from
// it, or one they chose (ADR 0017), and the log by a short hash, so no
// page or log line carries a cookie (ADR 0010). A drawn name is a family
// and a given name from public/names.js (ADR 0018), sent as its draw so
// each page writes it in its own language; the server speaks English.
type Draw = [number, number];
const bot = (who: string) => BOTS.find((b) => b.id === who);
// Hashed on demand: caching would keep an entry for every cookie ever
// seen, and a client without cookies gets a new one each request.
const hash = (who: string): Buffer => createHash("sha256").update(who).digest();
// A typed name has no draw; a person who never chose has the draw their
// cookie gives.
function drawOf(who: string): Draw | null {
  if (bot(who)) return null;
  const h = hash(who);
  const c = chosen[h.toString("hex").slice(0, 16)];
  if (typeof c === "string") return null;
  return c ?? [h[0] % FAMILY.length, h[1] % GIVEN.length];
}
function nameOf(who: string): string {
  const b = bot(who);
  if (b) return b.name;
  const d = drawOf(who);
  return d ? drawn("en", d) : (chosen[key(who)] as string);
}
// A pixel face (ADR 0021): a house trader's own, or a plain one a person
// is dealt from their cookie, as their drawn name is.
// A career's key is the cookie's hash in hex, so a dealt face is read from
// the same byte, and careers saved before faces have one too. A face the
// person drew instead is kept under that key.
const faces: Record<string, string> = existsSync(FACES_FILE) ? JSON.parse(readFileSync(FACES_FILE, "utf8")) : {};
const faceAt = (k: string): string => faces[k] ?? `p${Number.parseInt(k.slice(4, 6), 16) % PEOPLE.length}`;
const faceOf = (who: string): string => (bot(who) ? who : faceAt(key(who)));
// Six hex characters tell people apart in the log at a glance; a career
// is filed under sixteen, so two people's careers never merge.
const short = (who: string): string => (bot(who) ? who : hash(who).toString("hex").slice(0, 6));
const key = (who: string): string => (bot(who) ? who : hash(who).toString("hex").slice(0, 16));

// Names people chose, by career key, kept on the volume so a name
// outlives a restart. Only the server decides what a name may be: plain
// letters, numbers, spaces and a little punctuation, up to 20 wide (a
// Japanese or Chinese character counts as two), never a house trader's
// and never one someone else holds, whatever its case or spacing.
// A typed name is kept as text, a drawn one as its draw.
const chosen: Record<string, string | Draw> = existsSync(NAMES_FILE) ? JSON.parse(readFileSync(NAMES_FILE, "utf8")) : {};
const NAME_WIDTH = 20;
const NAMES_MAX = 10_000;
const same = (name: string): string => name.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
const width = (text: string): number => [...text].reduce((n, ch) => n + (/[⺀-鿿＀-￯　-〿가-힯]/.test(ch) ? 2 : 1), 0);
// The house traders in every language, their given names alone, and
// fan nicknames: 韭留美 for Kurumi, ばなな for Nana (ADRs 0015, 0018).
const RESERVED = new Set([...Object.values(T).flatMap((l) => Object.values(l.bots).flatMap((b) => [b.name, ...b.name.split(" ").slice(1)])), "くるみ", "久留美", "韭留美", "萌智子", "芽吹", "やす子", "安子", "いなご", "稻子", "なな", "奈奈", "ばなな", "きずな", "绊"].map(same));
// Every language's form of every drawn name, back to its draw.
const DRAWS = new Map<string, Draw>(FAMILY.flatMap((_, f) => GIVEN.flatMap((_, g) => LANG_LIST.map((l) => [same(drawn(l, [f, g])), [f, g] as Draw]))));
// What makes two names the same: a drawn name's draw, whatever language
// it is written in, or a typed name ignoring case and spacing.
const identity = (name: string, draw: Draw | null = DRAWS.get(same(name)) ?? null): string => (draw ? `d${draw}` : `t${same(name)}`);
const identityOf = (who: string): string => identity(nameOf(who), drawOf(who));
// Anyone else's name: chosen, in the hall of fame, or on a page now.
function taken(id: string, who: string): boolean {
  const mine = key(who);
  if (Object.entries(chosen).some(([k, c]) => k !== mine && (typeof c === "string" ? identity(c) : identity("", c)) === id)) return true;
  if (Object.entries(career).some(([k, c]) => k !== mine && identity(c.name, c.draw ?? null) === id)) return true;
  return [...listeners].some((l) => l.who !== who && identityOf(l.who) === id);
}
function rename(who: string, input: unknown): { name: string; draw: Draw | null } | { error: string; status: number } {
  if (typeof input !== "string" || !input.trim()) return { error: "Choose a name.", status: 400 };
  const name = input.normalize("NFC").trim().replace(/\s+/g, " ");
  if (width(name) > NAME_WIDTH) return { error: "Names are up to 20 letters, or 10 in Japanese or Chinese.", status: 400 };
  if (!/^[\p{L}\p{N}][\p{L}\p{N} '’.\-_!?&・ー〜~♪]*$/u.test(name)) return { error: "Use letters, numbers, spaces and simple punctuation.", status: 400 };
  if (RESERVED.has(same(name))) return { error: "That name belongs to a house trader.", status: 400 };
  const draw = DRAWS.get(same(name)) ?? null;
  const id = identity(name, draw);
  if (taken(id, who)) return { error: "Someone already has that name.", status: 409 };
  const k = key(who);
  if (!(k in chosen) && Object.keys(chosen).length >= NAMES_MAX) return { error: "Too many names are taken. Try again later.", status: 409 };
  const before = nameOf(who);
  if (id === identityOf(who) && (draw || name === before)) return { name: before, draw };
  chosen[k] = draw ?? name;
  try {
    writeFileSync(`${NAMES_FILE}.tmp`, JSON.stringify(chosen));
    renameSync(`${NAMES_FILE}.tmp`, NAMES_FILE);
  } catch (error) {
    console.error("could not save the names:", error);
  }
  if (career[k]) {
    career[k].name = nameOf(who);
    career[k].draw = draw;
    saveCareer();
    queueMicrotask(rank);
  }
  log(who, "rename", { from: before });
  return { name: nameOf(who), draw };
}
// A face is one of the plain set by name, never a house trader's. Two
// people may share one: their names tell them apart.
const FACES_MAX = 10_000;
function reface(who: string, input: unknown): { face: string } | { error: string; status: number } {
  if (typeof input !== "string" || !/^p(0|[1-9]\d*)$/.test(input) || Number(input.slice(1)) >= PEOPLE.length) return { error: "Choose one of the faces.", status: 400 };
  const k = key(who);
  if (!(k in faces) && Object.keys(faces).length >= FACES_MAX) return { error: "Too many faces are chosen. Try again later.", status: 409 };
  if (faceAt(k) === input) return { face: input };
  faces[k] = input;
  try {
    writeFileSync(`${FACES_FILE}.tmp`, JSON.stringify(faces));
    renameSync(`${FACES_FILE}.tmp`, FACES_FILE);
  } catch (error) {
    console.error("could not save the faces:", error);
  }
  log(who, "reface", { face: input });
  return { face: input };
}

// A drawn name nobody else holds, to try on; nothing changes until it is chosen.
function suggestion(who: string): { name: string; draw: Draw } {
  const now = identityOf(who);
  let draw: Draw = [randomInt(FAMILY.length), randomInt(GIVEN.length)];
  for (let i = 0; i < 50 && (identity("", draw) === now || taken(identity("", draw), who)); i++) draw = [randomInt(FAMILY.length), randomInt(GIVEN.length)];
  return { name: drawn("en", draw), draw };
}

// One structured line per thing a trader does, with their short code and
// trader name. It goes to stdout, so `flyctl logs` tails it, and is
// appended to /data/activity.log, so the record outlives restarts: Fly's
// own buffer keeps about a hundred lines. The operator's /log page reads
// it back. Past 4 MB the older half is dropped, so it can't fill the volume.
type Line = { t: string; who: string; ev: string } & Record<string, unknown>;
const ACTIVITY_MAX = 4_000_000;
function readActivity(): Line[] {
  if (!existsSync(ACTIVITY)) return [];
  const lines: Line[] = [];
  for (const text of readFileSync(ACTIVITY, "utf8").split("\n")) {
    try {
      if (text) lines.push(JSON.parse(text) as Line);
    } catch {
      // a line cut short by a hard kill
    }
  }
  return lines;
}
function trimActivity(): void {
  if (!existsSync(ACTIVITY) || statSync(ACTIVITY).size <= ACTIVITY_MAX) return;
  const kept = readActivity();
  writeFileSync(`${ACTIVITY}.tmp`, kept.slice(kept.length >> 1).map((l) => JSON.stringify(l)).join("\n") + "\n");
  renameSync(`${ACTIVITY}.tmp`, ACTIVITY);
}
trimActivity();
setInterval(trimActivity, 3_600_000).unref();
const recent: Line[] = readActivity().slice(-300);

// The log records people and rounds. The bots trade every few seconds and
// would bury two classmates' lines in `flyctl logs`, so they are left out;
// the room's feed shows their trades, and each round's "end" line their
// results.
//
// Each request gets a short random ID, held for as long as the request is
// handled, so every event it causes carries it and its own request line
// ties the two together, as in the week 10 lecture. Events the clock
// causes, such as a stop-out or a round's end, carry none, which tells
// "they clicked" from "the market moved". stdout gets one readable line
// per event for narrating from `flyctl logs`; the saved log stays JSON.
const requests = new AsyncLocalStorage<string>();
const value = (v: unknown): string => (typeof v === "string" && /[\s"=]/.test(v) ? JSON.stringify(v) : Array.isArray(v) ? JSON.stringify(v) : String(v));
function readable(line: Line): string {
  const { t: _t, req, ev, ...rest } = line;
  return `[${req ?? "------"}] ${ev} ${Object.entries(rest).map(([k, v]) => `${k}=${value(v)}`).join(" ")}`.trimEnd();
}
function log(who: string | null, ev: string, fields: Record<string, unknown> = {}): void {
  if (who !== null && bot(who)) return;
  const req = requests.getStore();
  const line: Line = { t: new Date().toISOString(), ...(req ? { req } : {}), who: who ? short(who) : "server", ...(who ? { name: nameOf(who) } : {}), ev, ...fields };
  const text = JSON.stringify(line);
  console.log(readable(line));
  recent.push(line);
  recent.splice(0, recent.length - 300);
  try {
    appendFileSync(ACTIVITY, `${text}\n`);
  } catch (error) {
    console.error("could not append to the activity log:", error);
  }
}

// Career results across rounds and restarts: the long-term ranking.
type Career = { name: string; draw?: Draw | null; rounds: number; profit: number; wins: number; busts: number; best: number };
const career: Record<string, Career> = existsSync(CAREER_FILE) ? JSON.parse(readFileSync(CAREER_FILE, "utf8")) : {};
// Changes are saved once, just after the code that made them, however
// many careers changed; a failed write is reported and the game goes on.
let saving = false;
function writeCareer(): void {
  saving = false;
  try {
    writeFileSync(`${CAREER_FILE}.tmp`, JSON.stringify(career));
    renameSync(`${CAREER_FILE}.tmp`, CAREER_FILE);
  } catch (error) {
    console.error("could not save the hall of fame:", error);
  }
}
function saveCareer(): void {
  if (saving) return;
  saving = true;
  setImmediate(() => saving && writeCareer());
}

const seed = Date.now() % 2 ** 31;
const rnd = random(seed);

// Today's real rates for live rounds, fetched at most every hour, falling
// back to the newest ECB row in the bundled history.
let today: { date: string; rates: Record<string, number> } | null = null;
let fetched = 0;
async function refreshToday(): Promise<void> {
  if (Date.now() - fetched < 3_600_000) return;
  fetched = Date.now();
  try {
    const res = await fetch("https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD,JPY,GBP,CHF,AUD,CNY", { signal: AbortSignal.timeout(5_000) });
    const data = (await res.json()) as { date: string; rates: Record<string, number> };
    today = { date: data.date, rates: { EUR: 1, ...data.rates } };
    log(null, "rates", { date: data.date });
  } catch (error) {
    console.error("could not fetch today's rates:", error);
  }
}
function todayRate(pair: Pair): { rate: number; date: string; source: string } {
  const [base, quote] = pair.split("/");
  if (today && today.rates[base] && today.rates[quote]) return { rate: today.rates[quote] / today.rates[base], date: today.date, source: "Frankfurter (ECB and central banks)" };
  const day = history.latest(pair);
  return { rate: day.rate, date: day.date, source: "ECB, bundled" };
}

// Only people who trade have careers, one per person across both modes.
// A change is saved at once (the file is small), so a bust survives a
// crash mid-round, and the top ten are worked out again only then.
let fame: (Career & { key: string })[] = [];
// The hall is for people: a house trader's row, from an older version or
// put in by hand, is dropped when the server starts, and never ranked.
for (const k of Object.keys(career)) if (bot(k)) delete career[k];
function rank(): void {
  fame = Object.entries(career).filter(([k]) => !bot(k)).map(([k, c]) => ({ key: k, ...c })).sort((a, b) => b.profit - a.profit).slice(0, 10);
}
rank();
function record(who: string): Career | null {
  if (bot(who)) return null;
  career[key(who)] ??= { name: nameOf(who), draw: drawOf(who), rounds: 0, profit: 0, wins: 0, busts: 0, best: 0 };
  saveCareer();
  queueMicrotask(rank);
  return career[key(who)];
}

// The two markets a visitor can pick between by tab. Each is a room of
// its own, with its own round, desk, bots, feed and bell, and both run
// all the time: History replays real days with the date hidden, Scenario
// starts from today's real rate and plays a hidden script (ADR 0027).
const MODES = ["history", "scenario"] as const;
type Mode = (typeof MODES)[number];
type Listener = { res: ServerResponse; who: string; mode: Mode | "tutorial" };
type News = { text: string; kind: string; key: string; args: Record<string, string | number> };
type Facts = { pair: string; simulated: boolean; from: string; to: string; event: { date: string; title: string; note: string } | null; source?: string; scenario?: string };
const listeners = new Set<Listener>();

class Market {
  readonly mode: Mode;
  count = 0;
  round!: Round;
  desk!: Desk;
  tick = 0;
  // A market waits in the lobby until someone on its tab presses Start,
  // counts down so others can join, trades, rings the bell, and goes back
  // to the lobby. Nothing moves while nobody has asked to play.
  phase: "lobby" | "countdown" | "trade" | "break" = "lobby";
  breakLeft = 0;
  countdown = 0;
  startedBy: string | null = null;
  ironman = false;
  // The latest Scenario headline, pinned under the price until the next.
  headline: { scenario: string; n: number } | null = null;
  // Ticks left in a pause, or 0 when the market runs.
  paused = 0;
  result: { ranking: { key: string; code: string; name: string; draw: Draw | null; face: string; balance: number; sat: boolean; left: boolean }[]; reveal: string; facts: Facts } | null = null;
  // The bell's facts, for a page to tell in its own language.
  facts: Facts = { pair: "", simulated: false, from: "", to: "", event: null };
  // What the bell will say, decided when the round starts.
  reveal = "";
  // Each line is English text for the log and for pages without a
  // translation, plus a key and values a page translates from.
  feed: News[] = [];
  prays = new Map<string, number>();
  // Moments every page on the tab pops a bubble for: a prayer, a big bet,
  // a banked result, a margin call, a cut, a loan. Numbered so a page
  // shows each once; only the last few seconds are kept, and each names
  // the trader by short code.
  pops: { n: number; at: number; who: string; kind: string; lev?: number; pnl?: number }[] = [];
  popCount = 0;
  pop(who: string, kind: string, extra: { lev?: number; pnl?: number } = {}): void {
    this.pops.push({ n: ++this.popCount, at: this.tick, who: short(who), kind, ...extra });
    this.pops = this.pops.filter((p) => this.tick - p.at <= POP_TICKS).slice(-POPS_MAX);
  }

  constructor(mode: Mode) {
    this.mode = mode;
  }

  // Draws the next round and parks it, its price still, in the lobby.
  ready(): void {
    if (this.mode === "scenario") {
      const pair = PAIRS[Math.floor(rnd() * PAIRS.length)];
      const now = todayRate(pair);
      this.round = scenario(history, pair, now.rate, rnd);
      const story = T.en.scenarios[this.round.scenario!];
      this.reveal = `That was ${story.name}, simulated from ${pair} on ${now.date} (${now.source}): ${story.note}`;
      this.facts = { pair, simulated: true, from: now.date, to: now.date, event: null, source: now.source, scenario: this.round.scenario };
    } else {
      const round = replay(history, rnd, 0.6);
      this.round = round;
      this.reveal = `That was ${round.pair} from ${round.days[0]} to ${round.days.at(-1)}.${round.event ? ` ${round.event.title} (${round.event.date}): ${round.event.note}` : ""}`;
      this.facts = { pair: round.pair, simulated: false, from: round.days[0], to: round.days.at(-1)!, event: round.event ? { date: round.event.date, title: round.event.title, note: round.event.note } : null };
    }
    this.desk = new Desk(this.round.prices[0]);
    for (const b of BOTS) this.desk.join(b.id);
    for (const l of this.listeners()) this.desk.join(l.who);
    this.tick = 0;
    this.phase = "lobby";
    this.startedBy = null;
    this.ironman = false;
    this.paused = 0;
    this.headline = null;
    this.prays.clear();
    this.pops = [];
  }

  // Someone on the tab asks to play: the countdown begins.
  request(who: string, ironman = false): string | null {
    if (this.phase === "countdown") return "The round is already about to start.";
    if (this.phase !== "lobby") return "A round is already running.";
    if (!this.listeners().some((l) => l.who === who)) return "Open this tab to start its round.";
    this.phase = "countdown";
    this.countdown = COUNTDOWN_TICKS;
    this.startedBy = who;
    this.ironman = ironman;
    this.result = null;
    this.feed = [];
    const secs = Math.max(1, Math.round((COUNTDOWN_TICKS * TICK_MS) / 1000));
    this.say(`${nameOf(who)} pressed Start. Trading opens in ${secs} second${secs === 1 ? "" : "s"}.`, "info", "started", { who: short(who), secs });
    if (ironman) this.say(`Ironman round: nobody can pause it.`, "info", "ironman");
    log(who, "ask", { mode: this.mode, ironman });
    return null;
  }

  // The starter changes their mind before the price moves. Orders placed
  // in the countdown are voided: the round never happened.
  cancel(who: string): string | null {
    if (this.phase !== "countdown") return "There is no countdown to cancel.";
    if (!this.mayRule(who)) return "Only the person who pressed Start can cancel it.";
    log(who, "cancel", { mode: this.mode });
    const by = nameOf(who);
    this.ready();
    this.say(`${by} cancelled the start.`, "info", "cancelled", { who: short(who) });
    return null;
  }

  // The starter rules the round: cancel its countdown, or end it early for
  // everyone. If they have left the tab, anyone still on it may.
  mayRule(who: string): boolean {
    const here = this.listeners();
    if (!here.some((l) => l.who === who)) return false;
    return who === this.startedBy || !here.some((l) => l.who === this.startedBy);
  }

  // Ends the round now for everyone: the bell rings at today's price.
  finish(who: string): string | null {
    if (this.phase !== "trade") return "No round is trading.";
    if (!this.mayRule(who)) return "Only the person who pressed Start can end the round.";
    log(who, "finish", { mode: this.mode, tick: this.tick });
    this.say(`${nameOf(who)} ended the round early.`, "info", "finished", { who: short(who) });
    this.end();
    return null;
  }

  // One person walks out: their position closes at the price, their
  // result stands, and they watch the rest. Nobody else is touched.
  leave(who: string): string | null {
    if (this.phase !== "trade" && this.phase !== "countdown") return "No round is running.";
    if (!this.listeners().some((l) => l.who === who)) return "Open this tab to leave its round.";
    this.desk.join(who);
    const out = this.desk.leave(who);
    if (typeof out === "string") return out;
    this.report(out);
    this.say(`${nameOf(who)} left the round to watch.`, "info", "left", { who: short(who) });
    log(who, "leave", { mode: this.mode });
    return null;
  }

  // Halt the market for everyone, or set it going again.
  pause(who: string, on: boolean): string | null {
    if (this.phase !== "trade") return "No round is trading.";
    if (!this.listeners().some((l) => l.who === who)) return "Open this tab to pause its round.";
    if (on && this.ironman) return "This is an ironman round: it cannot be paused.";
    if (on && this.paused) return "The round is already paused.";
    if (!on && !this.paused) return "The round is not paused.";
    this.paused = on ? PAUSE_TICKS : 0;
    this.say(on ? `${nameOf(who)} paused the round.` : `${nameOf(who)} resumed the round.`, "info", on ? "paused" : "resumed", { who: short(who) });
    log(who, on ? "pause" : "resume", { mode: this.mode, tick: this.tick });
    return null;
  }

  // After the bell: close it now, or hold it longer, by anyone on the tab.
  bell(who: string, hold: boolean): string | null {
    if (this.phase !== "break") return "The bell isn't showing.";
    if (!this.listeners().some((l) => l.who === who)) return "Open this tab to change its bell.";
    if (hold) this.breakLeft = Math.min(BREAK_MAX, this.breakLeft + HOLD_TICKS);
    else this.ready();
    log(who, hold ? "hold" : "dismiss", { mode: this.mode });
    return null;
  }

  start(): void {
    this.count++;
    this.phase = "trade";
    for (const l of this.listeners()) this.desk.join(l.who);
    this.say(this.round.simulated ? `Scenario: ${this.round.pair} from today's real rate. The script is hidden until the bell.` : `Replay: ${this.round.pair}, forty real trading days. When? Find out at the bell.`, "info", this.round.simulated ? "scenario-round" : "replay-round", { pair: this.round.pair });
    log(null, "start", { mode: this.mode, pair: this.round.pair, from: this.round.days[0], event: this.round.event?.title ?? null, simulated: this.round.simulated });
    void refreshToday();
  }

  listeners(): Listener[] {
    return [...listeners].filter((l) => l.mode === this.mode);
  }

  say(text: string, kind: string, key = "", args: Record<string, string | number> = {}): void {
    this.feed.unshift({ text, kind, key, args });
    this.feed.splice(14);
  }

  digits(): number {
    return this.round.pair.endsWith("JPY") ? 3 : 5;
  }

  fmt(p: number): string {
    return p.toFixed(this.digits());
  }

  // Turn the desk's events into the room's feed. A stop-out is everyone's
  // business; that is the point of trading in the same room.
  report(events: Fill[]): void {
    for (const e of events) {
      const name = nameOf(e.who);
      // `who` is the short code, so a page can put each trader's name in
      // its own language; `pnl` stays a number for the page to format.
      const a = { who: short(e.who), pnl: Math.round(e.pnl), lev: e.leverage ?? 0, price: this.fmt(e.price) };
      if (e.kind === "open") this.say(`${name} ${e.side === 1 ? "bought" : "sold"} at ${e.leverage}×`, e.leverage! >= WILD ? "wild" : "trade", e.side === 1 ? "bought" : "sold", a);
      else if (e.kind === "add") this.say(`${name} doubled down. Now ${e.leverage}×`, "wild", "added", a);
      else if (e.kind === "close") this.say(`${name} closed: ${yen(e.pnl)}`, e.pnl >= 0 ? "win" : "loss", "closed", a);
      else if (e.kind === "stop") this.say(`${name}'s stop filled at ${this.fmt(e.price)}: ${yen(e.pnl)}`, e.pnl >= 0 ? "win" : "loss", "stopped", a);
      else if (e.kind === "call") this.say(`MARGIN CALL for ${name}!`, "call", "call", a);
      else if (e.kind === "stopout") this.say(`強制ロスカット! ${name} was stopped out: ${yen(e.pnl)}. Out of the round.`, "bust", "stopout", a);
      else if (e.kind === "zerocut") this.say(`${name} was wiped out and leaves the market.`, "bust", "zerocut", a);
      if (e.kind === "open" && e.leverage! >= WILD) this.pop(e.who, "wild", { lev: e.leverage });
      else if (e.kind === "add") this.pop(e.who, "add", { lev: e.leverage });
      else if (e.kind === "close" || e.kind === "stop") this.pop(e.who, "close", { pnl: Math.round(e.pnl) });
      else if (e.kind === "call" || e.kind === "stopout" || e.kind === "zerocut") this.pop(e.who, e.kind);
      if (e.kind === "stopout" || e.kind === "zerocut") {
        const c = record(e.who);
        if (c) c.busts++;
      }
      log(e.who, e.kind, { mode: this.mode, pair: this.round.pair, price: Number(this.fmt(e.price)), pnl: Math.round(e.pnl), ...(e.side ? { side: e.side === 1 ? "buy" : "sell", leverage: e.leverage } : {}) });
    }
  }

  end(): void {
    const desk = this.desk;
    const ranking = desk.settle();
    // Watchers are on the desk but never ordered, so they get no career.
    const humans = ranking.filter((r) => !bot(r.who) && desk.account(r.who).traded);
    for (const r of humans) {
      const c = record(r.who)!;
      c.rounds++;
      c.profit += r.net - START;
      c.best = Math.max(c.best, r.net - START);
      if (r === humans[0] && humans.length > 1) c.wins++;
    }
    // The bell's result is final and is shown at once, so it is on disk
    // before any page can see it: a crash after the bell keeps it.
    if (humans.length) writeCareer();
    // The bell ranks the bots and everyone who traded, then lists, unranked,
    // everyone still on the tab when it rang who sat the round out; a
    // passer-by who left is not named.
    // Who left mid-round is listed with them, unranked, as having left.
    const here = new Set(this.listeners().map((l) => l.who));
    const sat = (who: string): boolean => !bot(who) && !desk.account(who).traded;
    const left = (who: string): boolean => desk.account(who).left;
    const aside = (who: string): number => Number(sat(who) || left(who));
    const shown = ranking.filter((r) => !sat(r.who) || here.has(r.who) || left(r.who)).sort((a, b) => aside(a.who) - aside(b.who));
    this.result = { ranking: shown.map((r) => ({ key: key(r.who), code: short(r.who), name: nameOf(r.who), draw: drawOf(r.who), face: faceOf(r.who), balance: r.net, sat: sat(r.who) && !left(r.who), left: left(r.who) })), reveal: this.reveal, facts: this.facts };
    log(null, "end", { mode: this.mode, ranking: ranking.map((r) => [short(r.who), r.net]) });
    this.phase = "break";
    this.breakLeft = BREAK_TICKS;
  }

  // Each tick moves the price, lets the bots act, enforces the rules and
  // sends the new state to everyone on this tab.
  step(): void {
    if (this.phase === "lobby") return;
    if (this.phase === "countdown") {
      const go = --this.countdown <= 0;
      if (go) this.start();
      return this.broadcast(go);
    }
    if (this.phase === "break") {
      const over = --this.breakLeft <= 0;
      if (over) this.ready();
      return this.broadcast(over);
    }
    if (this.paused) {
      // A pause counts down on its own, and the room hears when it ends.
      if (--this.paused <= 0) {
        this.paused = 0;
        this.say("The pause is over.", "info", "unpaused");
        return this.broadcast(true);
      }
      // Pages show the seconds left, so tell them each second.
      if (this.paused % Math.max(1, Math.round(1000 / TICK_MS)) === 0) this.broadcast();
      return;
    }
    this.tick++;
    this.report(this.desk.mark(this.round.prices[this.tick]));
    // A Scenario's headlines, each on its day: enough, read with care, to
    // see the script coming (ADR 0027).
    if (this.tick % STEPS === 1) {
      const day = (this.tick - 1) / STEPS;
      const words = this.round.scenario ? T.en.scenarios[this.round.scenario].headlines : [];
      this.round.headlines?.forEach((h, i) => {
        if (h.day !== day) return;
        this.say(words[i], "news", "headline", { scenario: this.round.scenario!, n: i });
        this.headline = { scenario: this.round.scenario!, n: i };
      });
    }
    const seen = this.round.prices.slice(0, this.tick + 1);
    for (const b of BOTS) {
      const action = b.act(this.desk, b.id, seen, rnd);
      if (action) this.apply(b.id, action);
    }
    if (this.tick >= this.round.prices.length - 1) {
      this.end();
      return this.broadcast(true);
    }
    this.broadcast();
  }

  apply(who: string, action: Action): string | null {
    if (this.phase === "lobby") return "The market is closed. Press Start to begin a round.";
    // In the countdown the price stands at the open: a player may place
    // and take back an order, but not pray to or borrow against it.
    if (this.phase === "countdown" && (action.kind === "pray" || action.kind === "borrow")) return "Trading opens when the countdown ends.";
    if (this.phase !== "trade" && this.phase !== "countdown") return "The market is closed. Next round soon.";
    if (this.paused) return "The round is paused. Orders wait until it resumes.";
    const desk = this.desk;
    desk.join(who);
    if (action.kind === "pray") {
      const n = (this.prays.get(who) ?? 0) + 1;
      this.prays.set(who, n);
      log(who, "pray", { mode: this.mode, times: n });
      this.pop(who, "pray");
      if (n === 1 || n % 10 === 0) this.say(`${nameOf(who)} is praying to the chart (×${n}). It does nothing.`, "pray", "prayed", { who: short(who), n });
      return null;
    }
    if (action.kind === "stop") {
      const refused = desk.stopAway(who, action.pct);
      const at = desk.account(who).pos?.stop ?? null;
      if (!refused) log(who, "stop-set", { mode: this.mode, at: at === null ? null : Number(this.fmt(at)) });
      return refused;
    }
    if (action.kind === "borrow") {
      const refused = desk.borrow(who);
      if (refused) return refused;
      const first = desk.account(who).debt === BORROW;
      this.say(first ? `${nameOf(who)} borrowed ${yen(BORROW)} from Dad's savings. "Just until the market turns."` : `${nameOf(who)} borrowed from Dad again. That was the last of it.`, "wild", first ? "borrowed" : "borrowed-again", { who: short(who), amount: BORROW });
      this.pop(who, "borrow");
      log(who, "borrow", { mode: this.mode, debt: desk.account(who).debt });
      return null;
    }
    const out = action.kind === "close" ? desk.close(who) : desk.order(who, action.side, action.leverage, action.stake);
    if (typeof out === "string") return out;
    this.report(out);
    return null;
  }

  // The room is the bots, people with this tab open, and anyone still
  // holding a position; someone who looked in and left is not listed.
  room() {
    const desk = this.desk;
    const open = new Set(this.listeners().map((l) => l.who));
    const traders = desk.players().filter((p) => bot(p) || open.has(p) || desk.account(p).pos).map((p) => {
      const a = desk.account(p);
      return { who: p, id: short(p), name: nameOf(p), draw: drawOf(p), face: faceOf(p), bot: !!bot(p), motto: bot(p)?.motto, equity: Math.round(desk.equity(p) - a.debt), side: a.pos?.side ?? 0, leverage: a.pos?.leverage ?? 0, out: a.out, left: a.left };
    });
    traders.sort((a, b) => b.equity - a.equity);
    return { traders };
  }

  // What one visitor sees: the shared chart, everyone's standing, and
  // their own account in full. Other people's positions show side and
  // leverage but not their stops, which would be a gift to the room.
  // Pages are sent the whole price history when they join or a round
  // changes phase, and otherwise only the newest price, from `from` on.
  view(who: string, from = 0, shared = this.room()) {
    const { desk, round, tick } = this;
    const mine = desk.players().includes(who) ? desk.account(who) : null;
    const me = key(who);
    return {
      mode: this.mode,
      phase: this.phase,
      countdown: Math.ceil((this.countdown * TICK_MS) / 1000),
      startedBy: this.startedBy && nameOf(this.startedBy),
      startedCode: this.startedBy && short(this.startedBy),
      // Whether this visitor may cancel or end the round for everyone.
      rules: this.startedBy !== null && this.mayRule(who),
      ironman: this.ironman,
      headline: this.headline,
      // Seconds left in a pause, or null while the market runs.
      paused: this.paused ? Math.ceil((this.paused * TICK_MS) / 1000) : null,
      startedDraw: this.startedBy && drawOf(this.startedBy),
      round: this.count,
      pair: round.pair,
      digits: this.digits(),
      simulated: round.simulated,
      tick,
      total: round.prices.length - 1,
      steps: STEPS,
      start: START,
      from,
      prices: round.prices.slice(from, tick + 1),
      breakLeft: Math.ceil((this.breakLeft * TICK_MS) / 1000),
      you: {
        name: nameOf(who),
        draw: drawOf(who),
        face: faceOf(who),
        code: short(who),
        balance: mine?.balance ?? START,
        equity: Math.round(mine ? desk.equity(who) : START),
        pnl: Math.round(mine ? desk.pnl(who) : 0),
        level: mine?.pos ? Math.round(desk.level(who) * 100) : null,
        out: mine?.out ?? false,
        left: mine?.left ?? false,
        debt: mine?.debt ?? 0,
        loansLeft: LOANS - (mine?.debt ?? 0) / BORROW,
        broke: mine ? desk.broke(who) : false,
        cuts: mine?.cuts ?? 0,
        pos: mine?.pos ? { side: mine.pos.side, entry: mine.pos.entry, leverage: mine.pos.leverage, margin: mine.pos.margin, stop: mine.pos.stop, called: mine.pos.called, ...desk.lines(who) } : null,
      },
      traders: shared.traders.map(({ who: p, ...t }) => ({ ...t, you: p === who })),
      feed: this.feed,
      pops: this.pops.map(({ at: _at, ...p }) => p),
      result: this.result && { ...this.result, ranking: this.result.ranking.map(({ key: k, ...r }) => ({ ...r, you: k === me })) },
      career: fame.map(({ key: k, ...c }) => ({ ...c, face: faceAt(k), you: k === me })),
      leverages: LEVERAGES,
      ...quote(desk.price),
      // How many people are on each tab, for the tab labels.
      here: Object.fromEntries(MODES.map((m) => [m, new Set([...listeners].filter((l) => l.mode === m).map((l) => l.who)).size])),
    };
  }

  // The room is worked out once per broadcast and shared by every view.
  // During the break nothing moves but the clock, so after the bell's full
  // message the pages are sent only an empty price list.
  broadcast(full = false): void {
    const shared = this.room();
    const from = full ? 0 : this.phase === "break" ? this.tick + 1 : this.tick;
    for (const l of this.listeners()) l.res.write(`data: ${JSON.stringify(this.view(l.who, from, shared))}\n\n`);
  }
}

const markets = Object.fromEntries(MODES.map((m) => [m, new Market(m)])) as Record<Mode, Market>;
// The Scenario tab was called Live; an old page or link asking for it gets
// Scenario (ADR 0027).
const modeOf = (value: unknown): Mode => (value === "live" ? "scenario" : MODES.includes(value as Mode) ? (value as Mode) : "history");

// The Tutorial tab: each visitor's own private market (src/tutorial.ts),
// kept in memory, seen by nobody else and never in the hall of fame. One
// left untouched for an hour is dropped, so the map can't grow forever.
const tutorials = new Map<string, { t: Tutorial; used: number }>();
function tutorialOf(who: string): Tutorial {
  let entry = tutorials.get(who);
  if (!entry) {
    entry = { t: new Tutorial(), used: 0 };
    tutorials.set(who, entry);
  }
  entry.used = Date.now();
  return entry.t;
}
setInterval(() => {
  for (const [who, e] of tutorials) if (Date.now() - e.used > 3_600_000) tutorials.delete(who);
}, 600_000).unref();

function tutorialView(who: string) {
  const t = tutorialOf(who);
  const a = t.desk.account("me");
  const l = t.lesson();
  return {
    mode: "tutorial",
    phase: t.moving() ? "moving" : "waiting",
    round: t.runs,
    pair: "USD/JPY",
    digits: 3,
    simulated: true,
    from: 0,
    prices: t.prices,
    // The chart fits whatever has played so far, a candle every 4 ticks.
    total: Math.max(40, t.prices.length - 1),
    tick: t.prices.length - 1,
    steps: 4,
    start: START,
    lesson: { id: l.id, next: l.allow({ kind: "next" }) === null, n: Math.min(t.index, LESSONS.length - 1) + 1, of: LESSONS.length, title: l.title, text: l.text, task: l.task, focus: l.focus, finished: t.finished() },
    you: {
      name: nameOf(who),
      draw: drawOf(who),
      code: short(who),
      balance: a.balance,
      equity: Math.round(t.desk.equity("me")),
      pnl: Math.round(t.desk.pnl("me")),
      level: a.pos ? Math.round(t.desk.level("me") * 100) : null,
      out: a.out,
      debt: a.debt,
      loansLeft: LOANS - a.debt / BORROW,
      broke: t.desk.broke("me"),
      cuts: a.cuts,
      pos: a.pos ? { side: a.pos.side, entry: a.pos.entry, leverage: a.pos.leverage, margin: a.pos.margin, stop: a.pos.stop, called: a.pos.called, ...t.desk.lines("me") } : null,
    },
    traders: [],
    feed: t.feed,
    pops: [],
    result: null,
    career: fame.map(({ key: k, ...c }) => ({ ...c, you: k === key(who) })),
    leverages: LEVERAGES,
    ...quote(t.price()),
    here: Object.fromEntries(MODES.map((m) => [m, new Set([...listeners].filter((l) => l.mode === m).map((l) => l.who)).size])),
  };
}
function sendTutorial(who: string): void {
  const text = `data: ${JSON.stringify(tutorialView(who))}\n\n`;
  for (const l of listeners) if (l.mode === "tutorial" && l.who === who) l.res.write(text);
}

setInterval(() => {
  for (const m of MODES) markets[m].step();
  for (const [who, e] of tutorials) if (e.t.moving()) {
    e.t.step();
    sendTutorial(who);
  }
}, TICK_MS).unref();

const send = (res: ServerResponse, [content, type]: [string, string]): void => {
  res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
  res.end(content);
};

const json = (res: ServerResponse, status: number, data: unknown): void => {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(data));
};

// An order is a small JSON object; anything else, or over 1 KB, is refused.
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > 1024) throw new Error("too large");
    chunks.push(chunk);
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("not an object");
  return value as Record<string, unknown>;
}

const HTML = "text/html; charset=utf-8";

// Each page in each language at its own address: English at /, Japanese
// under /ja/, Chinese under /zh/ (ADR 0016). The market is the same page,
// and the same rooms, in every language; only its words change, and the
// server writes them in from the start, so the title, the html lang and a
// link's preview are right before any script runs.
const LANGS = ["en", "ja", "zh"] as const;
type Lang = (typeof LANGS)[number];
const HTMLLANG: Record<Lang, string> = { en: "en", ja: "ja", zh: "zh-CN" };
const prefix = (lang: Lang): string => (lang === "en" ? "" : `/${lang}`);
const escape = (text: string): string => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const alternates = (page: "" | "about"): string =>
  LANGS.map((l) => `  <link rel="alternate" hreflang="${HTMLLANG[l]}" href="${prefix(l)}/${page}">`).join("\n") +
  `\n  <link rel="alternate" hreflang="x-default" href="/${page}">`;
// The web fonts every page loads: JetBrains Mono for numbers, M PLUS
// Rounded 1c for Latin and kana, and Noto Sans JP, SC and KR (OFL) for
// every Chinese character and Hangul, so Windows and Linux never fall to
// a mismatched system face. Google serves each in small slices by
// character, so a page fetches only the glyphs it shows.
const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=M+PLUS+Rounded+1c:wght@400;700;800&family=Noto+Sans+JP:wght@400;700;800&family=Noto+Sans+SC:wght@400;700;800&family=Noto+Sans+KR:wght@400;700;800&display=swap">`;
const market = read("public/index.html");
const marketIn = (lang: Lang): string => {
  const ui = T[lang].ui;
  const vars: Record<string, string> = {
    htmllang: HTMLLANG[lang],
    lang,
    title: escape(`${ui.logo}${ui.titleJoin}${ui.sub}`),
    alternates: alternates(""),
    fonts: FONTS,
    home: `${prefix(lang)}/`,
    logo: escape(ui.logo),
    sub: escape(ui.sub),
    about: `${prefix(lang)}/about`,
  };
  return market.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k]);
};
const THEME = `<script>try { const t = localStorage.getItem("theme"); if (t === "light" || t === "dark") document.documentElement.dataset.theme = t; } catch {}</script>`;
const aboutIn = (lang: Lang): string => {
  const a = ABOUT[lang];
  const body = a.sections.map(([h, ps]) => `<h2>${escape(h)}</h2>${ps.map((p) => `<p>${escape(p)}</p>`).join("")}`).join("");
  const others = LANGS.filter((l) => l !== lang).map((l) => `<a href="${prefix(l)}/about" hreflang="${HTMLLANG[l]}" lang="${HTMLLANG[l]}">${{ en: "English", ja: "日本語", zh: "简体中文" }[l]}</a>`).join(" · ");
  return `<!doctype html><html lang="${HTMLLANG[lang]}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(a.title)}</title>\n${alternates("about")}<link rel="icon" href="/favicon.svg" type="image/svg+xml">${FONTS}<link rel="stylesheet" href="/app.css">${THEME}</head><body class="readme about"><main><p class="logo">${escape(T[lang].ui.logo)}</p><h1>${escape(a.title)}</h1><p class="lead">${escape(a.lead)}</p>${body}<nav class="about-links"><a href="${prefix(lang)}/">${escape(a.back)}</a> · <a href="/readme/">${escape(a.readme)}</a></nav><p class="about-langs">${others}</p></main></body></html>`;
};
const readme = `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>About Losscut!</title><link rel="icon" href="/favicon.svg" type="image/svg+xml">${FONTS}<link rel="stylesheet" href="/app.css">${THEME}</head><body class="readme"><main>${renderMarkdown(read("README.md"))}<p><a href="/">Back to the market</a></p></main></body></html>`;
const PAGES: Record<string, [string, string]> = {
  ...Object.fromEntries(LANGS.flatMap((l) => [[`${prefix(l)}/`, [marketIn(l), HTML]], [`${prefix(l)}/about`, [aboutIn(l), HTML]]])),
  "/app.js": [read("public/app.js"), "text/javascript; charset=utf-8"],
  "/app.css": [read("public/app.css"), "text/css; charset=utf-8"],
  "/format.js": [read("public/format.js"), "text/javascript; charset=utf-8"],
  "/i18n.js": [read("public/i18n.js"), "text/javascript; charset=utf-8"],
  "/names.js": [read("public/names.js"), "text/javascript; charset=utf-8"],
  "/indicators.js": [read("public/indicators.js"), "text/javascript; charset=utf-8"],
  "/avatars.js": [read("public/avatars.js"), "text/javascript; charset=utf-8"],
  "/ticket.js": [read("public/ticket.js"), "text/javascript; charset=utf-8"],
  "/art.js": [read("public/art.js"), "text/javascript; charset=utf-8"],
  "/tips.js": [read("public/tips.js"), "text/javascript; charset=utf-8"],
  "/i18n-long.js": [read("public/i18n-long.js"), "text/javascript; charset=utf-8"],
  "/favicon.svg": [read("public/favicon.svg"), "image/svg+xml"],
  "/readme": [readme, HTML],
};

// The activity log names traders by short code next to what they did, so
// it is the operator's alone: only the holder of STATS_KEY (a Fly secret,
// never in the repo) may read it, and anyone else gets the 404 of a path
// that does not exist. With no key set it is shut to everyone.
const STATS_KEY = process.env.STATS_KEY ?? "";
// The market pages a debugger is served with the console added.
const DEBUG_PAGES = new Set(LANGS.map((l) => `${prefix(l)}/`));
const DEBUG_JS: [string, string] = [read("public/debug.js"), "text/javascript; charset=utf-8"];
// What the debug console can do. Each acts on the server, where the
// rules live, and changes only what it names: the hall, a round's phase,
// or the debugger's own account. It is logged with the debugger's code.
function debugAction(who: string, kind: string, mode: Mode): { ok?: true; error?: string; status?: unknown } {
  const market = markets[mode];
  const desk = market.desk;
  switch (kind) {
    case "status":
      return { ok: true, status: { here: here(), rooms: MODES.map((m) => ({ mode: m, phase: markets[m].phase, round: markets[m].count, pair: markets[m].round.pair, tick: markets[m].tick, of: markets[m].round.prices.length - 1, event: markets[m].round.event?.title ?? null, from: markets[m].round.days[0] })), fame: Object.keys(career).length, names: Object.keys(chosen).length } };
    case "reset-fame":
      for (const k of Object.keys(career)) delete career[k];
      writeCareer();
      rank();
      for (const m of MODES) markets[m].broadcast();
      return { ok: true };
    case "start":
      if (market.phase === "trade") return { error: "Already trading." };
      market.result = null;
      market.feed = [];
      if (market.phase === "break") market.ready();
      market.start();
      market.broadcast(true);
      return { ok: true };
    case "end":
      if (market.phase !== "trade") return { error: "No round is trading." };
      market.end();
      market.broadcast(true);
      return { ok: true };
    case "lobby":
      market.ready();
      market.broadcast(true);
      return { ok: true };
    case "call":
    case "cut":
      if (market.phase !== "trade") return { error: "No round is trading." };
      desk.join(who);
      if (!desk.rebase(who, kind === "call" ? 0.4 : 0.1)) return { error: "Open a position first." };
      market.report(desk.enforce(who));
      market.broadcast();
      return { ok: true };
    case "reset-me":
      desk.reset(who);
      market.broadcast();
      return { ok: true };
    default:
      return { error: "Unknown debug action." };
  }
}

// The optional background music (ADR 0020), served as exact bytes, not
// text, and in ranges, so a browser starts playing before the whole file
// arrives and can seek. One fixed file: nothing else in the folder, and
// no path a request names, is ever read.
const BGM = readFileSync(join(ROOT, "public/audio/bgm.m4a"));
function sendAudio(req: IncomingMessage, res: ServerResponse): void {
  const total = BGM.length;
  const head = { "content-type": "audio/mp4", "accept-ranges": "bytes", "cache-control": "public, max-age=86400" };
  const range = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
  if (!range) {
    res.writeHead(200, { ...head, "content-length": total });
    return void res.end(req.method === "HEAD" ? undefined : BGM);
  }
  // bytes=a-b, bytes=a- (to the end), or bytes=-n (the last n)
  let start = range[1] === "" ? total - Number(range[2]) : Number(range[1]);
  let end = range[1] === "" || range[2] === "" ? total - 1 : Number(range[2]);
  start = Math.max(0, start);
  end = Math.min(end, total - 1);
  if (start > end || start >= total) {
    res.writeHead(416, { ...head, "content-range": `bytes */${total}` });
    return void res.end();
  }
  res.writeHead(206, { ...head, "content-range": `bytes ${start}-${end}/${total}`, "content-length": end - start + 1 });
  res.end(req.method === "HEAD" ? undefined : BGM.subarray(start, end + 1));
}

const LOG_PAGES: Record<string, [string, string]> = {
  "/log": [read("public/log.html"), HTML],
  "/log.js": [read("public/log.js"), "text/javascript; charset=utf-8"],
};
const equalSecret = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return y.length > 0 && x.length === y.length && timingSafeEqual(x, y);
};
function operator(url: URL): boolean {
  return equalSecret(url.searchParams.get("key") ?? "", STATS_KEY);
}

// The hidden debug mode (ADR 0019), for the operator alone. Opening any
// page with ?debug=KEY sets a dbg cookie: this visitor's id signed with
// the key, so it is never the key, works for nobody else, and dies when
// the key is rotated. With it the page loads /debug.js, a console for
// testing; without it that script and every debug action are a 404.
const debugToken = (who: string): string => createHmac("sha256", STATS_KEY).update(`debug:${who}`).digest("hex").slice(0, 32);
function debugging(req: IncomingMessage, who: string): boolean {
  const given = req.headers.cookie?.match(/(?:^|;\s*)dbg=([0-9a-f]{32})/)?.[1] ?? "";
  return STATS_KEY.length > 0 && equalSecret(given, debugToken(who));
}
// Everyone with the page open, however many tabs.
const ids = (): Set<string> => new Set([...listeners].map((l) => l.who));
const here = (): number => ids().size;

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;
  let who = req.headers.cookie?.match(/(?:^|;\s*)v=([0-9a-f-]{36})/)?.[1] ?? null;
  const cookies: string[] = [];
  if (!who) {
    who = randomUUID();
    cookies.push(`v=${who}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`);
  }
  // ?debug=KEY turns debug mode on for this visitor; ?debug=off turns it off.
  let debug = debugging(req, who);
  if (req.method === "GET" && url.searchParams.has("debug")) {
    if (url.searchParams.get("debug") === "off") {
      cookies.push("dbg=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict");
      debug = false;
    } else if (equalSecret(url.searchParams.get("debug") ?? "", STATS_KEY)) {
      cookies.push(`dbg=${debugToken(who)}; Path=/; Max-Age=86400; HttpOnly; SameSite=Strict`);
      debug = true;
      log(who, "debug", { action: "on" });
    }
  }
  if (cookies.length) res.setHeader("set-cookie", cookies);

  // A language's home is its folder: /ja and /zh move to /ja/ and /zh/,
  // so its relative links and the address bar agree.
  if (req.method === "GET" && (url.pathname === "/ja" || url.pathname === "/zh")) {
    res.writeHead(301, { location: `${url.pathname}/` });
    return void res.end();
  }
  // A debugger's page loads the console too; nobody else's does.
  if (req.method === "GET" && debug && DEBUG_PAGES.has(url.pathname)) return send(res, [PAGES[url.pathname][0].replace("</body>", `  <script type="module" src="/debug.js"></script>\n</body>`), HTML]);
  if (req.method === "GET" && path === "/debug.js") return debug ? send(res, DEBUG_JS) : json(res, 404, { error: "Not found." });
  if (path === "/api/debug") {
    if (!debug || req.method !== "POST") return json(res, 404, { error: "Not found." });
    let input: Record<string, unknown>;
    try {
      input = await body(req);
    } catch {
      return json(res, 400, { error: "Send JSON." });
    }
    const out = debugAction(who, String(input.kind), modeOf(input.mode));
    log(who, "debug", { action: String(input.kind), mode: modeOf(input.mode), ...(out.error ? { why: out.error } : {}) });
    return json(res, out.error ? 409 : 200, out);
  }
  if ((req.method === "GET" || req.method === "HEAD") && url.pathname === "/audio/bgm.m4a") return sendAudio(req, res);
  if (req.method === "GET" && PAGES[url.pathname]) return send(res, PAGES[url.pathname]);
  if (req.method === "GET" && PAGES[path]) return send(res, PAGES[path]);
  if (req.method === "GET" && (LOG_PAGES[path] || path === "/api/log") && !operator(url)) {
    return json(res, 404, { error: "Not found." });
  }
  if (req.method === "GET" && LOG_PAGES[path]) return send(res, LOG_PAGES[path]);
  if (req.method === "GET" && path === "/api/log") {
    const rooms = MODES.map((m) => ({ mode: m, round: markets[m].count, pair: markets[m].round.pair, phase: markets[m].phase }));
    return json(res, 200, { here: here(), rooms, recent: recent.slice(-150).toReversed() });
  }

  // Opening a tab joins that market's round in progress with a fresh
  // account; switching tabs opens a new stream on the other market.
  if (req.method === "GET" && path === "/api/events" && url.searchParams.get("mode") === "tutorial") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
    const listener: Listener = { res, who, mode: "tutorial" };
    const already = ids().has(who);
    listeners.add(listener);
    log(who, already ? "tab" : "join", { mode: "tutorial", ...(already ? {} : { here: here() }) });
    res.write(`data: ${JSON.stringify(tutorialView(who))}\n\n`);
    // The page's close runs later, outside this request; it keeps the ID
    // of the request that opened it, so its join and leave pair up.
    const opened = requests.getStore();
    req.on("close", () => {
      listeners.delete(listener);
      if (!ids().has(who)) requests.run(opened ?? "------", () => log(who, "leave", { here: here() }));
    });
    return;
  }
  if (req.method === "GET" && path === "/api/events") {
    const market = markets[modeOf(url.searchParams.get("mode"))];
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
    const listener: Listener = { res, who, mode: market.mode };
    const already = ids().has(who);
    listeners.add(listener);
    if (!already) log(who, "join", { mode: market.mode, here: here() });
    else log(who, "tab", { mode: market.mode });
    if (market.phase !== "break" && !market.desk.players().includes(who)) {
      market.desk.join(who);
      market.say(`${nameOf(who)} entered the market.`, "info", "entered", { who: short(who) });
    }
    res.write(`data: ${JSON.stringify(market.view(who))}\n\n`);
    // The page's close runs later, outside this request; it keeps the ID
    // of the request that opened it, so its join and leave pair up.
    const opened = requests.getStore();
    req.on("close", () => {
      listeners.delete(listener);
      if (!ids().has(who)) requests.run(opened ?? "------", () => log(who, "leave", { here: here() }));
    });
    return;
  }

  if (req.method === "GET" && path === "/api/state") {
    if (url.searchParams.get("mode") === "tutorial") return json(res, 200, tutorialView(who));
    return json(res, 200, markets[modeOf(url.searchParams.get("mode"))].view(who));
  }

  // A person's trader name: GET draws one to try, POST chooses one. Every
  // page sees the new name with the next broadcast.
  if (req.method === "GET" && path === "/api/name") return json(res, 200, suggestion(who));
  if (req.method === "POST" && path === "/api/name") {
    let input: Record<string, unknown>;
    try {
      input = await body(req);
    } catch {
      return json(res, 400, { error: "Send JSON." });
    }
    const result = rename(who, input.name);
    if ("error" in result) {
      log(who, "refused", { action: "rename", why: result.error });
      return json(res, result.status, { error: result.error });
    }
    for (const m of MODES) markets[m].broadcast();
    sendTutorial(who);
    return json(res, 200, result);
  }

  // A person's face: POST chooses one of the plain set; the page draws
  // one to try on from its own copy of them.
  if (req.method === "POST" && path === "/api/face") {
    let input: Record<string, unknown>;
    try {
      input = await body(req);
    } catch {
      return json(res, 400, { error: "Send JSON." });
    }
    const result = reface(who, input.face);
    if ("error" in result) {
      log(who, "refused", { action: "reface", why: result.error });
      return json(res, result.status, { error: result.error });
    }
    for (const m of MODES) markets[m].broadcast();
    return json(res, 200, result);
  }

  if (req.method === "POST" && path === "/api/act") {
    let input: Record<string, unknown>;
    try {
      input = await body(req);
    } catch {
      return json(res, 400, { error: "Send JSON." });
    }
    const kind = input.kind;
    let action: Action | null = null;
    if (kind === "buy" || kind === "sell") {
      const stake = typeof input.stake === "number" ? input.stake : 1;
      action = { kind: "order", side: kind === "buy" ? 1 : -1, leverage: Number(input.leverage), stake };
    } else if (kind === "close" || kind === "pray" || kind === "borrow") action = { kind };
    // A stop is asked for as a distance from the price, and set from the
    // server's price; none removes it.
    else if (kind === "stop") action = { kind: "stop", pct: typeof input.pct === "number" ? input.pct : null };
    if (input.mode === "tutorial") {
      const t = tutorialOf(who);
      let error: string | null = null;
      if (kind === "restart") t.restart();
      else if (kind === "next") error = t.act({ kind: "next" });
      else if (action && action.kind !== "pray") error = t.act(action as Move);
      else if (action) error = "Praying isn't part of the tutorial. It does nothing anyway.";
      else return json(res, 400, { error: "Unknown action." });
      log(who, error ? "refused" : "lesson", { mode: "tutorial", action: kind, lesson: t.lesson().id, ...(error ? { why: error } : {}) });
      sendTutorial(who);
      return json(res, error ? 409 : 200, error ? { error } : { ok: true });
    }
    // A round's controls (ADR 0022): cancel the countdown, end the round,
    // leave it, and close or hold the bell. The market checks who may.
    if ((kind === "cancel" || kind === "finish" || kind === "leave" || kind === "hold" || kind === "dismiss" || kind === "pause" || kind === "resume") && input.mode !== "tutorial") {
      const market = markets[modeOf(input.mode)];
      const error = kind === "cancel" ? market.cancel(who) : kind === "finish" ? market.finish(who) : kind === "leave" ? market.leave(who) : kind === "pause" || kind === "resume" ? market.pause(who, kind === "pause") : market.bell(who, kind === "hold");
      if (error) {
        log(who, "refused", { mode: market.mode, action: kind, why: error });
        return json(res, 409, { error });
      }
      market.broadcast(true);
      return json(res, 200, { ok: true });
    }
    if (kind === "start" && input.mode !== "tutorial") {
      const market = markets[modeOf(input.mode)];
      const error = market.request(who, input.ironman === true);
      if (error) return json(res, 409, { error });
      market.broadcast(true);
      return json(res, 200, { ok: true });
    }
    if (!action) return json(res, 400, { error: "Unknown action." });
    const market = markets[modeOf(input.mode)];
    const error = market.apply(who, action);
    if (error) {
      log(who, "refused", { mode: market.mode, action: kind, why: error });
      return json(res, 409, { error });
    }
    market.broadcast();
    return json(res, 200, { ok: true });
  }
  json(res, 404, { error: "Not found." });
}

// Every request runs under its own ID. Actions get a request line when
// they finish, with status, time and who sent them; page loads and the
// event stream are left out, as noise.
createServer((req, res) => {
  const id = randomBytes(3).toString("hex");
  const began = performance.now();
  if (req.method === "POST") {
    res.on("finish", () => {
      const who = req.headers.cookie?.match(/(?:^|;\s*)v=([0-9a-f-]{36})/)?.[1];
      console.log(`[${id}] ${req.method} ${req.url?.split("?")[0]} ${res.statusCode} ${Math.round(performance.now() - began)}ms${who ? ` who=${short(who)}` : ""}`);
    });
  }
  requests.run(id, () => void handle(req, res));
}).listen(PORT, "0.0.0.0", () => console.log(`losscut on :${PORT}, seed ${seed}`));

for (const m of MODES) markets[m].ready();
// Every page is pinged every 5s so dead connections are found and dropped.
setInterval(() => {
  for (const l of [...listeners]) {
    const ok = l.res.write(": ping\n\n");
    if (!ok && l.res.writableLength > 64_000) l.res.destroy();
  }
}, 5_000).unref();
