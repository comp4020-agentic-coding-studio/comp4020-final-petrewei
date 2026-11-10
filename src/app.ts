import { tradeAction } from "./actions.ts";
import type { RoundState, Sent, TutorialState } from "../public/protocol.js";
// Losscut!'s server: two shared markets, Rewind and Random, each traded
// live by everyone on that tab, plus seven house bots in each. The server
// owns the price, fills every order at the price when it arrives, and
// enforces margin calls and stop-outs; pages only show what it sends (ADR
// 0010). A round is about two minutes: Rewind plays real days with the
// date hidden, Random simulates a random market from today's rate. The hall of fame,
// across both, is kept on the volume.
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, renameSync, statSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { gzipSync } from "node:zlib";
import { join } from "node:path";
import { type Action, BOTS } from "./bots.ts";
import { type Feat, FEATS, fromBell, fromCredit, fromFill } from "./feats.ts";
import { MIN_ROUNDS, guessBonus, hall, score, scoreBreakdown } from "./score.ts";
import { atLeverage, CAP, Desk, type Fill, LEVERAGES, LIMIT, quote, RULES, START, STEP, type Trade } from "./fx.ts";
import { ABOUT } from "../public/about.js";
import { PEOPLE } from "../public/avatars.js";
import { quoted, aud } from "../public/format.js";
import { pipOf } from "../public/ticket.js";
import { LANGS as LANG_LIST, T, clueDates, news } from "../public/i18n.js";
import { drawn, GIVEN } from "../public/names.js";
import { renderMarkdown } from "./markdown.ts";
import { alternates, escape, FONTS, HTMLLANG, headerIn, LANGS, type Lang, marketIn, prefix } from "./pages.ts";
import { BACK_AFTER, CANDLE, DAY_TICKS, EVENTS, SWAN_DAY, History, Minutes, ALL_PAIRS, PAIRS, isPair, random, replayRound, simulation, storyOf, type AnyPair, type Pair, type Round } from "./market.ts";
import { LESSONS, type Move, Tutorial } from "./tutorial.ts";
import { Live } from "./live.ts";

import { systemClock, type Clock, type Timer } from "./clock.ts";
import { Feed } from "./feed.ts";
import type { News } from "./news.ts";
import { jsonStorage, type Storage } from "./storage.ts";
import { namesValid, migrateNames, facesValid, careerValid } from "./saved.ts";
import { Mcp } from "./mcp.ts";

async function readJson(req: IncomingMessage, limit: number, empty: string): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > limit) throw new Error("too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || empty);
}

function sseData(view: unknown): string {
  return `data: ${JSON.stringify(view)}\n\n`;
}

export type AppOptions = {
  dataDir?: string;
  storage?: Storage;
  clock?: Clock;
  quotes?: Feed;
  news?: News;
  fetch?: typeof globalThis.fetch;
  env?: NodeJS.ProcessEnv;
};

// Each instance owns its mutable state and resources. Importing this module starts nothing.
export function createApp(options: AppOptions = {}) {
  const clock = options.clock ?? systemClock;
  const env = { ...process.env, ...options.env };
  const storage = options.storage ?? jsonStorage;
  const fetchRates = options.fetch ?? globalThis.fetch;
  const timers = new Set<Timer>();
  let stopped = false;
  const repeat = (callback: () => void, ms: number): Timer => {
    const timer = clock.every(() => { if (!stopped) callback(); }, ms);
    timers.add(timer);
    return timer;
  };
  const defer = (callback: () => void): void => {
    const timer = clock.defer(() => { timers.delete(timer); if (!stopped) callback(); });
    timers.add(timer);
  };
  let disposeMarket = () => {};
  try {
    const PORT = Number(env.PORT ?? 8080);
    const DATA_DIR = options.dataDir ?? env.DATA_DIR ?? "/data";
    const ROOT = join(import.meta.dirname, "..");
    const CAREER_FILE = join(DATA_DIR, "career.json");
    const NAMES_FILE = join(DATA_DIR, "names.json");
    const FACES_FILE = join(DATA_DIR, "faces.json");
    const ACTIVITY = join(DATA_DIR, "activity.log");
    // Half a second a tick: five days of 96 ticks is 481 ticks, four minutes at 1×, two at 2× (ADR 0085).
    const TICK_MS = Number(env.TICK_MS ?? 500);
    // The feed's line as a round opens, by where its prices come from; a bridged rewind says its moves are simulated.
    const OPENING = { simulation: "random-round", minutes: "rewind-round", bridged: "rewind-bridged-round" } as const;
    // A pop lasts about four seconds on the wire; a busy room keeps 40.
    const POP_TICKS = 8;
    const POPS_MAX = 40;
    // The broker's numbers a page is told with every state, and which never change while it runs.
    const DESK = { ...RULES, ticksPerMinute: Math.round(60_000 / TICK_MS) };
    // Rewind's plots by number and pair, for its lobby's choice; the number is all that names one.
    const REWIND_PLOTS = EVENTS.map((e, i) => ({ n: i + 1, pair: e.pair }));
    // The least time between one person's choices of round in the lobby.
    const CHOOSE_MS = Number(env.CHOOSE_MS ?? 250);
    // The chart marks a trader's fills, as many as the window can show before they crowd it.
    const MARKS_MAX = 120;
    // Which fills get a face on the chart: a trader's own decisions and the broker's cut, not a margin call.
    const MARKED = new Set(["open", "add", "close", "stop", "take", "stopout", "zerocut"]);
    // The bell shows for twenty seconds; anyone on the tab may close it or
    // hold it thirty more, up to five minutes in all (ADR 0022).
    const BREAK_TICKS = 40;
    const HOLD_TICKS = Math.round(30_000 / TICK_MS);
    const BREAK_MAX = Math.round(300_000 / TICK_MS);
    // After Start, five seconds for others on the tab to join, and to place
    // an order at the opening price, before the price moves.
    const COUNTDOWN_TICKS = Number(env.COUNTDOWN_TICKS ?? 10);
    // A pause halts the price and the orders for everyone; anyone on the tab
    // may pause or resume, and a pause ends by itself after a minute so
    // nobody can hold a room (ADR 0024). An ironman round cannot pause.
    const PAUSE_TICKS = Number(env.PAUSE_TICKS ?? Math.round(60_000 / TICK_MS));
    // A bet this big, 300× on the ladder and up, is the room's business: a red feed line and a bubble.
    const WILD = 200;
    mkdirSync(DATA_DIR, { recursive: true });

    const read = (file: string): string => readFileSync(join(ROOT, file), "utf8");
    const history = new History(read("data/ecb.csv"));
    const minutes = new Minutes(read("data/minutes.csv"));
    // Every story's clues, one a day before its break, checked once here: a story whose clues the table lacks stops the
    // server from starting, which a deploy shows, rather than throwing in the tick that would take every room down.
    for (const e of EVENTS) for (const lang of LANG_LIST) {
      if ((T[lang].clues[e.date]?.length ?? 0) < SWAN_DAY - 1) throw new Error(`${e.id}: ${lang} needs ${SWAN_DAY - 1} clues for ${e.date}`);
    }

    // A visitor is their cookie; others see them by a trader name drawn from
    // it, or one they chose (ADR 0017), and the log by a short hash, so no
    // page or log line carries a cookie (ADR 0010). A drawn name is a given
    // name from public/names.js (ADR 0038), sent as its index so each page
    // writes it in its own language; the server speaks English.
    type Draw = number;
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
      if (c !== undefined) return c;
      // a newcomer is dealt a free name: from their cookie's place in the list, the next one nobody has chosen, so the
      // name their box opens with is theirs to keep; two bytes spread the starting places evenly over every name
      const held = heldDraws();
      const start = h.readUInt16BE(1) % GIVEN.length;
      for (let i = 0; i < GIVEN.length; i++) {
        const d = (start + i) % GIVEN.length;
        if (!held.has(d)) return d;
      }
      return start;
    }
    // The drawn names somebody has chosen or carries in the hall of fame, which nobody else may be dealt or offered.
    // Built once and kept until a name or a career changes, since every name on every broadcast asks for it.
    let held: Set<Draw> | null = null;
    function heldDraws(): Set<Draw> {
      if (held) return held;
      held = new Set<Draw>();
      for (const c of Object.values(chosen)) if (typeof c === "number") held.add(c);
      for (const c of Object.values(career)) if (typeof c.draw === "number") held.add(c.draw);
      return held;
    }
    function nameOf(who: string): string {
      const b = bot(who);
      if (b) return b.name;
      const d = drawOf(who);
      return d !== null ? drawn("en", d) : (chosen[key(who)] as string);
    }
    // A pixel face (ADR 0021): a house trader's own, or a plain one a person
    // is dealt from their cookie, as their drawn name is.
    // A career's key is the cookie's hash in hex, so a dealt face is read from
    // the same byte, and careers saved before faces have one too. A face the
    // person drew instead is kept under that key.
    const faceStore = storage.open<Record<string, string>>(FACES_FILE, { initial: () => ({}), validate: facesValid });
    const faces = faceStore.read();
    // A face nobody chose is worked out from the career key. The set grew from twelve: a key already on record keeps
    // the face the first twelve gave it, and a newcomer is dealt from every face; a newcomer's face is stored the moment
    // they come on record (`keepFace`), so it never jumps from one rule to the other.
    const FIRST_FACES = 12;
    const onRecord = (k: string): boolean => k in chosen || k in career;
    const faceAt = (k: string): string =>
      // a house trader's face is its own, as in the rounds
      bot(k) ? k : faces[k] ?? `p${onRecord(k) ? Number.parseInt(k.slice(4, 6), 16) % FIRST_FACES : Number.parseInt(k.slice(4, 8), 16) % PEOPLE.length}`;
    // Store a newcomer's dealt face before they come on record, so the face they were shown stays theirs.
    function keepFace(k: string): void {
      if (k in faces || onRecord(k)) return;
      faces[k] = faceAt(k);
      try {
        faceStore.write(faces);
      } catch (error) {
        console.error("could not save the faces:", error);
      }
    }
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
    const nameStore = storage.open<Record<string, string | Draw>>(NAMES_FILE, { initial: () => ({}), validate: namesValid, migrateLegacy: migrateNames });
    const chosen = nameStore.read();
    const NAME_WIDTH = 20;
    const NAMES_MAX = 10_000;
    const same = (name: string): string => name.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
    const width = (text: string): number => [...text].reduce((n, ch) => n + (/[⺀-鿿＀-￯　-〿가-힯]/.test(ch) ? 2 : 1), 0);
    // The house traders in every language, their given names alone, and
    // fan nicknames: 韭留美 for Kurumi, ばなな for Nana (ADRs 0015, 0018).
    const RESERVED = new Set([...Object.values(T).flatMap((l) => Object.values(l.bots).flatMap((b) => [b.name, ...b.name.split(" ").slice(1)])), "Fukuga Kurumi", "Kogane Mochiko", "Takane Yasuko", "Yamashi Mebuki", "Sakata Inago", "Zenba Nana", "Tsukimori Kizuna", "福賀くるみ", "福贺久留美", "小金萌智子", "高根やす子", "高根安子", "山師芽吹", "山师芽吹", "酒田いなご", "酒田稻子", "善波なな", "善波奈奈", "月森きずな", "月森绊", "くるみ", "久留美", "韭留美", "萌智子", "芽吹", "やす子", "安子", "いなご", "稻子", "なな", "奈奈", "ばなな", "きずな", "绊"].map(same));
    // Every language's form of every drawn name, back to its draw.
    const DRAWS = new Map<string, Draw>(GIVEN.flatMap((_, g) => LANG_LIST.map((l) => [same(drawn(l, g)), g] as [string, Draw])));
    // What makes two names the same: a drawn name's draw, whatever language
    // it is written in, or a typed name ignoring case and spacing.
    const identity = (name: string, draw: Draw | null = DRAWS.get(same(name)) ?? null): string => (draw !== null ? `d${draw}` : `t${same(name)}`);
    const identityOf = (who: string): string => identity(nameOf(who), drawOf(who));
    // A visitor with no record has not yet chosen a name or a face, nor played;
    // their page opens the name box for them (ADR 0038).
    const named = (who: string): boolean => bot(who) !== undefined || [chosen, faces, career].some((r) => key(who) in r);
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
      const k = key(who);
      const before = nameOf(who);
      // A dealt namesake may be present, but cannot displace this name's owner.
      if (k in chosen && id === identityOf(who) && (draw !== null || name === before)) return { name: before, draw };
      if (taken(id, who)) return { error: "Someone already has that name.", status: 409 };
      if (!(k in chosen) && Object.keys(chosen).length >= NAMES_MAX) return { error: "Too many names are taken. Try again later.", status: 409 };
      keepFace(k);
      chosen[k] = draw ?? name;
      held = null;
      try {
        nameStore.write(chosen);
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
        faceStore.write(faces);
      } catch (error) {
        console.error("could not save the faces:", error);
      }
      log(who, "reface", { face: input });
      return { face: input };
    }

    // A drawn name nobody else holds, to try on; nothing changes until it is chosen. It is drawn from the names still
    // free, so it is never one somebody has, however few are left; with none free it offers the visitor's own again.
    function suggestion(who: string): { name: string; draw: Draw } {
      const now = identityOf(who);
      const free = GIVEN.map((_, g) => g).filter((g) => identity("", g) !== now && !taken(identity("", g), who));
      const draw: Draw = free.length ? free[randomInt(free.length)] : (drawOf(who) ?? 0);
      return { name: drawn("en", draw), draw };
    }

    // One structured line per thing a trader does, with their short code and
    // trader name. It goes to stdout, so `flyctl logs` tails it, and is
    // appended to /data/activity.log, so the record outlives restarts: Fly's
    // own buffer keeps about a hundred lines. The operator's /log page reads
    // it back. Past 4 MB the older half is dropped, so it can't fill the volume.
    type Line = { t: string; who: string; ev: string } & Record<string, unknown>;
    const ACTIVITY_MAX = 4_000_000;
    // The log's lines, or only those in its last `tail` bytes: the operator's page shows the last few hundred, so a
    // start reads the end of a file that may be megabytes long, not all of it. A line cut by the tail's start is dropped.
    function readActivity(tail = Infinity): Line[] {
      if (!existsSync(ACTIVITY)) return [];
      const size = statSync(ACTIVITY).size;
      let text: string;
      if (size <= tail) text = readFileSync(ACTIVITY, "utf8");
      else {
        const bytes = Buffer.alloc(tail);
        const fd = openSync(ACTIVITY, "r");
        try { readSync(fd, bytes, 0, tail, size - tail); } finally { closeSync(fd); }
        const read = bytes.toString("utf8");
        text = read.slice(read.indexOf("\n") + 1);
      }
      const lines: Line[] = [];
      for (const line of text.split("\n")) {
        try {
          if (line) lines.push(JSON.parse(line) as Line);
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
    repeat(trimActivity, 3_600_000).unref();
    const recent: Line[] = readActivity(256_000).slice(-300);

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
    // `points` is the sum of a career's round scores (ADR 0029); careers saved
    // before scores have it worked out from their profit when they load.
    // `recent` is the last RECENT round scores, oldest first, for the hall's chart (ADR 0078); careers saved before it start empty.
    // `feats` is the achievements earned, by name (ADR 0082); careers saved before them start with none.
    type Career = { name: string; draw?: Draw | null; rounds: number; profit: number; wins: number; busts: number; best: number; points: number; recent?: number[]; feats?: Feat[] };
    const RECENT = 20;
    const careerStore = storage.open<Record<string, Career>>(CAREER_FILE, { initial: () => ({}), validate: careerValid });
    const career = careerStore.read();
    // ADR 0038: names became given names alone, and the hall began again, once:
    // a marker beside it says it has. Careers saved after that are kept.
    const HALL_MARK = join(DATA_DIR, "hall-given-names");
    if (!existsSync(HALL_MARK)) {
      for (const k of Object.keys(career)) delete career[k];
      careerStore.write(career);
      writeFileSync(HALL_MARK, "1");
    }
    // ADR 0087: accounts moved from ¥1,000,000 to A$10,000, so a career's money saved in yen is divided by a hundred, once,
    // as a marker beside it records. Scores are percentages and stay as they are.
    const AUD_MARK = join(DATA_DIR, "careers-in-aud");
    if (!existsSync(AUD_MARK)) {
      for (const c of Object.values(career)) {
        c.profit = Math.round(c.profit / 100);
        c.best = Math.round(c.best / 100);
      }
      if (Object.keys(career).length) careerStore.write(career);
      writeFileSync(AUD_MARK, "1");
    }
    // a career saved before scores is scored from its profit, once its profit is in dollars
    for (const c of Object.values(career)) c.points ??= (c.profit / START) * 100;

    // Changes are saved once, just after the code that made them, however
    // many careers changed; a failed write is reported and the game goes on.
    let saving = false;
    function writeCareer(): void {
      try {
        careerStore.write(career);
        saving = false;
      } catch (error) {
        console.error("could not save the hall of fame:", error);
      }
    }
    repeat(() => { if (saving) writeCareer(); }, 5_000).unref();
    function saveCareer(): void {
      held = null;
      if (saving) return;
      saving = true;
      defer(() => saving && writeCareer());
    }

    const seed = clock.now() % 2 ** 31;
    const rnd = random(seed);

    // Today's real rates for live rounds (ADR 0085): fetched again when a Random round is set up and the last fetch is
    // ten minutes old, so a refresh brings the latest; a failed fetch is tried again after a minute rather than an hour.
    // Without them, the newest ECB row in the bundled history.
    let today: { date: string; rates: Record<string, number> } | null = null;
    let fetched = 0;
    let failed = 0;
    let refreshing: Promise<void> | null = null;
    const FRESH_MS = 600_000;
    const RETRY_MS = 60_000;
    function refreshToday(): Promise<void> {
      if (refreshing) return refreshing;
      if (clock.now() - fetched < FRESH_MS || clock.now() - failed < RETRY_MS) return Promise.resolve();
      refreshing = (async () => {
        try {
          const res = await fetchRates("https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD,JPY,GBP,CHF,AUD,CNY", { signal: AbortSignal.timeout(5_000) });
          if (!res.ok) throw new Error(`rates returned HTTP ${res.status}`);
          const data = (await res.json()) as { date: string; rates: Record<string, number> };
          if (stopped) return;
          today = { date: data.date, rates: { EUR: 1, ...data.rates } };
          fetched = clock.now();
          log(null, "rates", { date: data.date });
        } catch (error) {
          if (stopped) return;
          failed = clock.now();
          console.error("could not fetch today's rates:", error);
        }
      })().finally(() => { refreshing = null; });
      return refreshing;
    }
    function todayRate(pair: AnyPair): { rate: number; date: string; source: string } {
      const [base, quote] = pair.split("/");
      if (today && today.rates[base] && today.rates[quote]) return { rate: today.rates[quote] / today.rates[base], date: today.date, source: "Frankfurter (ECB and central banks)" };
      const day = history.latest(pair);
      return { rate: day.rate, date: day.date, source: "ECB, bundled" };
    }

    // Only people who trade have careers, one per person across both modes.
    // A change is saved at once (the file is small), so a bust survives a
    // crash mid-round, and the top ten are worked out again only then.
    let fame: (Career & { key: string; average: number; ranked: boolean })[] = [];
    // The hall is for people: a house trader's row, from an older version or
    // put in by hand, is dropped when the server starts, and never ranked.
    for (const k of Object.keys(career)) if (bot(k)) delete career[k];
    function rank(): void {
      // Ranked by average score over enough rounds, then the newer players,
      // unranked, so the hall still shows who has begun (ADR 0029).
      // a career made only by an achievement, with no round finished and no bust, is not in the hall (ADR 0084)
      const { ranked, unranked } = hall(Object.entries(career).filter(([k, c]) => !bot(k) && (c.rounds > 0 || c.busts > 0)).map(([k, c]) => ({ key: k, ...c })));
      fame = [...ranked.map((r) => ({ ...r, ranked: true })), ...unranked.map((r) => ({ ...r, ranked: false }))].slice(0, 10);
    }
    rank();
    // The hall as a page is sent it, the same on every tab: each listed trader's achievements are public, as the hall
    // is (ADR 0085), only the names earned, and which row is the viewer's.
    const hallRows = () => fame.map(({ key: k, ...c }) => ({ key: k, ...c, recent: c.recent ?? [], feats: FEATS.filter((f) => c.feats?.includes(f)), face: faceAt(k) }));
    const hallFor = (me: string, rows = hallRows()) => rows.map(({ key: k, ...c }) => ({ ...c, you: k === me }));
    // Who a visitor is and what their desk account holds, as a round's page and the tutorial's are sent it. `as` is the
    // account's name on the desk, which is the visitor in a round and "me" in the tutorial; with no account, a fresh one.
    function youOn(desk: Desk, who: string, as = who) {
      const a = desk.players().includes(as) ? desk.account(as) : null;
      return {
        name: nameOf(who),
        draw: drawOf(who),
        named: named(who),
        face: faceOf(who),
        code: short(who),
        balance: a?.balance ?? START,
        equity: Math.round(a ? desk.equity(as) : START),
        pnl: Math.round(a ? desk.pnl(as) : 0),
        level: a?.pos ? Math.round(desk.level(as) * 100) : null,
        out: a?.out ?? false,
        // the credit line (ADR 0080): what is owed now, in whole dollars, and whether net worth is under zero
        debt: Math.round(a?.debt ?? 0),
        credit: Math.max(0, LIMIT - Math.round(a?.debt ?? 0)),
        broke: a ? desk.broke(as) : false,
        bankrupt: a ? desk.bankrupt(as) : false,
        cuts: a?.cuts ?? 0,
        // the margin in use: the one position's in a round, as Live sends the sum of its pairs'
        used: a?.pos?.margin ?? 0,
        pos: a?.pos ? { side: a.pos.side, entry: a.pos.entry, leverage: a.pos.leverage, margin: a.pos.margin, stop: a.pos.stop, take: a.pos.take, called: a.pos.called, pnl: Math.round(desk.pnl(as)), ...desk.lines(as) } : null,
      };
    }
    function record(who: string): Career | null {
      if (bot(who)) return null;
      keepFace(key(who));
      career[key(who)] ??= { name: nameOf(who), draw: drawOf(who), rounds: 0, profit: 0, wins: 0, busts: 0, best: 0, points: 0 };
      saveCareer();
      queueMicrotask(rank);
      return career[key(who)];
    }

    // Award achievements to a person (ADR 0082): each once, kept with their career, and said in the feed of the round
    // that earned it, so a room sees it happen. A house trader earns none.
    function award(m: Market, who: string, feats: Feat[]): void {
      if (bot(who) || !feats.length) return;
      const c = record(who)!;
      const had = new Set(c.feats ?? []);
      const fresh = feats.filter((f) => !had.has(f));
      if (!fresh.length) return;
      c.feats = [...had, ...fresh];
      saveCareer();
      for (const f of fresh) m.say(`${nameOf(who)} unlocked an achievement.`, "info", "feat", { who: short(who), feat: f });
    }

    // A round's controls (ADRs 0022, 0024, 0030), by the kind a page sends:
    // each asks the market, which checks the phase and who may.
    const CONTROLS: Record<string, (m: Market, who: string, input: Record<string, unknown>) => string | null> = {
      cancel: (m, who) => m.cancel(who),
      finish: (m, who) => m.finish(who),
      pause: (m, who) => m.pause(who, true),
      resume: (m, who) => m.pause(who, false),
      fast: (m, who) => m.setSpeed(who, true),
      normal: (m, who) => m.setSpeed(who, false),
      hold: (m, who) => m.bell(who, true),
      dismiss: (m, who) => m.bell(who, false),
      guess: (m, who, input) => m.guess(who, input.year as number),
      choose: (m, who, input) => m.choose(who, input.what),
      challenge: (m, who, input) => m.challenge(who, input.code),
      accept: (m, who, input) => m.accept(who, input.code),
    };
    // The first year of the ECB's rates, so the first a rewind can be from.
    const FIRST_YEAR = 1999;

    // The two markets a visitor can pick between by tab. Each is a room of
    // its own, with its own round, desk, bots, feed and bell, and both run
    // all the time: Rewind plays real days with the date hidden, Random
    // starts from today's real rate and simulates a random market (ADR 0027).
    const MODES = ["rewind", "random"] as const;
    type Mode = (typeof MODES)[number];
    // `feedSeen` is the version of its round's feed a page was last sent, so a delta resends the feed only when it moved.
    type Listener = { res: ServerResponse; who: string; mode: Mode | "tutorial" | "live"; feedSeen?: number };
    type News = { text: string; kind: string; key: string; args: Record<string, string | number>; when?: number };
    type Facts = { pair: string; simulated: boolean; from: string; to: string; event: { date: string; title: string; note: string } | null; source?: string; situation?: string };
    type Debrief = ReturnType<typeof scoreBreakdown> & { whatIf: ReturnType<Market["whatIf"]>; beforeFees: number; financing: number; interest: number; balance: number; debt: number; net: number; cuts: number; bonus: number; score: number };
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
      breakElapsed = 0;
      countdown = 0;
      startedBy: string | null = null;
      // How many ticks the market moves each beat: 1, or 2 when whoever rules the round speeds it up for everyone
      // (ADR 0085); the countdown, a pause and the bell keep to the clock.
      speed = 1;
      ironman = false;
      // The latest Random headline, pinned under the price until the next.
      headline: { situation: string; n: number } | { clue: number; n: number } | { story: number } | { release: Record<string, string | number> } | null = null;
      // Duels (ADR 0095): a challenge from one person to another in the room, by who was challenged, and the pairs who
      // accepted, compared at the bell on the round's own score. Set up again with each round.
      challenges = new Map<string, string>();
      duels: [string, string][] = [];
      // Each trader's guess at a rewind's year, private until the bell.
      guesses = new Map<string, number>();
      // Ticks left in a pause, or 0 when the market runs.
      paused = 0;
      result: { ranking: { key: string; code: string; name: string; draw: Draw | null; face: string; balance: number; score: number; guess: number | null; bonus: number; sat: boolean }[]; reveal: string; facts: Facts ; duels?: { a: string; b: string; winner: string | null; keys: string[] }[]} | null = null;
      private debriefs = new Map<string, Debrief>();
      // The bell's facts, for a page to tell in its own language.
      facts: Facts = { pair: "", simulated: false, from: "", to: "", event: null };
      // What the bell will say, decided when the round starts.
      reveal = "";
      // Each line is English text for the log and for pages without a
      // translation, plus a key and values a page translates from.
      feed: News[] = [];
      prays = new Map<string, number>();
      private pendingNotices = new Map<string, News>();
      // Moves whenever the feed or a private notice changes, so a page is resent the feed only when it is different.
      feedVersion = 0;
      // Moments every page on the tab pops a bubble for: a prayer, a big bet,
      // a banked result, a margin call, a cut, a loan. Numbered so a page
      // shows each once; only the last few seconds are kept, and each names
      // the trader by short code.
      pops: { n: number; at: number; who: string; kind: string; lev?: number; pnl?: number; way?: number }[] = [];
      popCount = 0;
      pop(who: string, kind: string, extra: { lev?: number; pnl?: number; way?: number } = {}): void {
        this.pops.push({ n: ++this.popCount, at: this.tick, who: short(who), kind, ...extra });
        this.pops = this.pops.filter((p) => this.tick - p.at <= POP_TICKS).slice(-POPS_MAX);
      }

      constructor(mode: Mode) {
        this.mode = mode;
      }

      // The moments of this round that the chart marks with a trader's face (ADR 0064): who
      // opened, added, closed or was cut out, on which tick, and which way. They are what the
      // feed already says in words, and no more: never a stop, a take profit or a cookie.
      marks: { tick: number; who: string; face: string; kind: string; side: number; key: string }[] = [];

      // What the lobby chose for the round it shows: a plot's id in Rewind, a pair in Random,
      // or nothing, which is drawn at random (ADR 0064). A choice is for that round only: when it
      // starts, the next is drawn at random again, or the lobby would rewind one plot for ever.
      pick: string | null = null;
      // When each person last chose, so one pressing "next" over and over cannot make every viewer
      // take a whole new round and a full state each time.
      private chose = new Map<string, number>();

      // Someone on the tab changes what the next round is, in the lobby only: Rewind moves to
      // a plot by its number; Random takes a pair. The round behind the lobby is
      // drawn again at once, so everyone's chart shows the new choice.
      choose(who: string, what: unknown): string | null {
        if (this.phase !== "lobby") return "The round is already about to start.";
        if (!this.listeners().some((l) => l.who === who)) return "Open this tab to choose its round.";
        if (clock.now() - (this.chose.get(who) ?? 0) < CHOOSE_MS) return "Slow down. Choose again in a moment.";
        this.chose.set(who, clock.now());
        if (this.mode === "random") {
          if (!isPair(what)) return "No such currency pair.";
          this.pick = what;
        } else {
          // A plot's number names its exact rewind; its title and date stay hidden until the bell.
          const plot = typeof what === "number" ? EVENTS[what - 1] : undefined;
          if (!plot) return "No such plot.";
          this.pick = plot.id;
        }
        log(who, "choose", { mode: this.mode });
        // Choosing the same plot (or Random pair) changes nothing.
        if (this.mode === "random" ? this.round.pair === this.pick : this.round.event?.id === this.pick) return null;
        this.ready();
        this.broadcast(true);
        return null;
      }

      // Draws the next round and parks it, its price still, in the lobby.
      ready(pick = this.pick): void {
        if (this.mode === "random") {
          // the lobby's choice, any of the forty-two; with none, a round drawn at random is one of the twenty-one, as a
          // broker lists them
          const pair = isPair(pick) ? pick : PAIRS[Math.floor(rnd() * PAIRS.length)];
          const now = todayRate(pair);
          this.round = simulation(history, pair, now.rate, rnd);
          const story = T.en.situations[this.round.situation!];
          this.reveal = `That was ${story.name}, simulated from ${pair} on ${now.date} (${now.source}): ${story.note}`;
          this.facts = { pair, simulated: true, from: now.date, to: now.date, event: null, source: now.source, situation: this.round.situation };
        } else {
          const round = replayRound(history, minutes, rnd, pick ?? undefined);
          this.round = round;
          this.reveal = `That was ${round.pair} from ${round.days[0]} to ${round.days.at(-1)}.${round.event ? ` ${round.event.title} (${round.event.date}): ${round.event.note}` : ""}`;
          this.facts = { pair: round.pair, simulated: false, from: round.days[0], to: round.days.at(-1)!, event: round.event ? { date: round.event.date, title: round.event.title, note: round.event.note } : null };
        }
        this.desk = new Desk(this.round.prices[0]);
        // the credit line's interest is by the day, so the desk is told the round's day (ADR 0080)
        this.desk.dayTicks = DAY_TICKS;
        for (const b of BOTS) this.desk.join(b.id);
        for (const l of this.listeners()) this.desk.join(l.who);
        this.tick = 0;
        this.phase = "lobby";
        this.startedBy = null;
        this.speed = 1;
        this.ironman = false;
        this.paused = 0;
        this.headline = null;
        this.guesses.clear();
        this.prays.clear();
        this.pendingNotices.clear();
        this.feedVersion++;
        this.pops = [];
        this.marks = [];
      }

      // Wait for fresh rates before orders are accepted. Keep the lobby's pair,
      // including any choice made while the fetch was pending; never redraw a
      // round another request has already started.
      async refreshLobby(): Promise<void> {
        if (this.mode !== "random" || this.phase !== "lobby") return;
        await refreshToday();
        if (this.phase !== "lobby") return;
        const now = todayRate(this.round.pair);
        if (this.round.prices[0] !== now.rate || this.facts.from !== now.date || this.facts.source !== now.source) this.ready(this.round.pair);
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
        this.debriefs.clear();
        this.feed = [];
        this.feedVersion++;
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

      // Name a replay's year (ADR 0030): in the second half of a trading
      // rewind, by anyone on the tab; a later guess replaces an earlier one.
      guess(who: string, year: number): string | null {
        if (this.mode !== "rewind") return "Only a replay has a year to guess.";
        if (this.phase !== "trade") return "No round is trading.";
        if (!this.listeners().some((l) => l.who === who)) return "Open this tab to guess its year.";
        if (this.tick < (this.round.prices.length - 1) / 2) return "Guesses open halfway through the round.";
        this.guesses.set(who, year);
        log(who, "guess", { mode: this.mode, year });
        return null;
      }

      // Speed the market up for everyone, or back to normal: whoever rules the round may (ADR 0085).
      setSpeed(who: string, fast: boolean): string | null {
        if (this.phase !== "trade") return "No round is trading.";
        if (!this.mayRule(who)) return "Only the person who pressed Start can change the speed.";
        this.speed = fast ? 2 : 1;
        this.say(fast ? `${nameOf(who)} sped the round up to 2×.` : `${nameOf(who)} set the round back to 1×.`, "info", fast ? "fast" : "normal", { who: short(who) });
        log(who, "speed", { mode: this.mode, speed: this.speed });
        this.broadcast();
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
      // Someone in this room, by the short code it shows, if a person here now; never a house trader.
      private personHere(code: unknown): string | null {
        if (typeof code !== "string") return null;
        const who = this.listeners().map((l) => l.who).find((w) => short(w) === code);
        return who && !bot(who) ? who : null;
      }
      private inDuel(who: string): boolean {
        return this.duels.some(([a, b]) => a === who || b === who);
      }
      // Challenge another person in the room to a duel over this round (ADR 0095), before the bell.
      challenge(who: string, code: unknown): string | null {
        if (this.phase === "break") return "The round is over. Challenge someone in the next.";
        const them = this.personHere(code);
        if (!them) return "Challenge someone in this room.";
        if (them === who) return "You cannot challenge yourself.";
        if (this.inDuel(who) || this.inDuel(them)) return "One of you is already in a duel.";
        this.challenges.set(them, who);
        this.say(`${nameOf(who)} challenged ${nameOf(them)} to a duel.`, "info", "challenged", { who: short(who), them: short(them) });
        return null;
      }
      // Accept the challenge someone in the room made you; the two of you are then compared at the bell.
      accept(who: string, code: unknown): string | null {
        const from = this.challenges.get(who);
        if (!from || short(from) !== code) return "No one has challenged you.";
        if (this.phase === "break") return "The round is over. Challenge someone in the next.";
        if (this.inDuel(who) || this.inDuel(from)) return "One of you is already in a duel.";
        this.challenges.delete(who);
        this.duels.push([from, who]);
        this.say(`${nameOf(who)} accepted ${nameOf(from)}'s duel.`, "wild", "accepted", { who: short(who), them: short(from) });
        return null;
      }

      // The bell is over and the room goes back to the lobby: duels were for the round just played, so they go with it
      // (ADR 0095); a duel made in the lobby stays for the round it was made for, however the lobby is redrawn.
      afterBell(): void {
        this.challenges.clear();
        this.duels = [];
        this.ready();
      }

      bell(who: string, hold: boolean): string | null {
        if (this.phase !== "break") return "The bell isn't showing.";
        if (!this.listeners().some((l) => l.who === who)) return "Open this tab to change its bell.";
        if (hold) this.breakLeft = Math.min(BREAK_MAX - this.breakElapsed, this.breakLeft + HOLD_TICKS);
        else this.afterBell();
        log(who, hold ? "hold" : "dismiss", { mode: this.mode });
        return null;
      }

      start(): void {
        this.debriefs.clear();
        this.count++;
        this.pick = null;
        this.phase = "trade";
        for (const l of this.listeners()) this.desk.join(l.who);
        const opening = OPENING[this.round.source];
        this.say(news("en", { key: opening, args: { pair: this.round.pair }, text: "" }, nameOf), "info", opening, { pair: this.round.pair });
        // The week's calendar (ADR 0085): each release named with its day and hour, as a trader's calendar shows it, and
        // nothing of how it comes out. A unit is four hours, and a release comes at its unit's start.
        for (const n of this.round.news ?? []) {
          if (!n.kind || !n.cur) continue;
          const at = n.day * this.round.unit;
          const args = { kind: n.kind, cur: n.cur, d: Math.floor(at / DAY_TICKS) + 1, h: Math.round(((at % DAY_TICKS) * 24) / DAY_TICKS) };
          this.say(`Calendar: ${n.cur} ${n.kind}, day ${args.d} at ${args.h}h.`, "info", "calendar", args);
        }
        log(null, "start", { mode: this.mode, pair: this.round.pair, from: this.round.days[0], event: this.round.event?.title ?? null, source: this.round.source });
        void refreshToday();
      }

      // The round's releases for the page's pinned calendar: each one's time, and its outcome once it has been told.
      calendarView(): { kind: string; cur: string; d: number; h: number; outcome: string | null }[] {
        if (this.phase !== "trade" && this.phase !== "countdown" && this.phase !== "break") return [];
        const now = this.phase === "countdown" ? -1 : this.tick;
        return (this.round.news ?? []).filter((n) => n.kind && n.cur).map((n) => {
          const at = n.day * this.round.unit;
          const told = now >= at + 1;
          const back = told && n.back && now >= (n.day + BACK_AFTER) * this.round.unit + 1;
          return { kind: n.kind!, cur: n.cur!, d: Math.floor(at / DAY_TICKS) + 1, h: Math.round(((at % DAY_TICKS) * 24) / DAY_TICKS), outcome: back ? "back" : told ? n.outcome! : null };
        });
      }

      listeners(): Listener[] {
        return [...listeners].filter((l) => l.mode === this.mode);
      }

      say(text: string, kind: string, key = "", args: Record<string, string | number> = {}): void {
        // each line is stamped when it is said, so the feed shows when it happened
        this.feed.unshift({ text, kind, key, args, when: clock.now() });
        this.feed.splice(14);
        this.feedVersion++;
      }

      // The bell's "what if" (ADR 0095): the round's biggest trade, by its margin, as it would have gone at 1x, Australia's
      // legal 30x and offshore 1000x, through the prices it was open over. The desk's marks are this round's ticks.
      whatIf(trades: Trade[]): { side: number; leverage: number; pnl: number; at: { leverage: number; pnl: number; stoppedOut: boolean }[] } | null {
        const t = trades.filter((x) => x.margin && x.opened !== undefined && x.closed !== undefined).sort((a, b) => b.margin! - a.margin!)[0];
        if (!t) return null;
        const prices = this.round.prices.slice(t.opened, t.closed! + 1);
        return { side: t.side, leverage: t.leverage, pnl: t.pnl, at: [1, CAP, 1000].map((leverage) => ({ leverage, ...atLeverage(t.side, t.entry, t.exit, t.margin!, leverage, prices) })) };
      }

      // Turn the desk's events into the room's feed. A stop-out is everyone's
      // business; that is the point of trading in the same room.
      report(events: Fill[]): void {
        for (const e of events) {
          if (e.kind === "pending-refused") {
            const reason = e.reason ?? "Refused.";
            this.pendingNotices.set(e.who, { text: `Your pending order could not fill. ${reason}`, kind: "info", key: "pending-refused", args: { reason } });
            this.feedVersion++;
            continue;
          }
          const name = nameOf(e.who);
          // `who` is the short code, so a page can put each trader's name in
          // its own language; `pnl` stays a number for the page to format.
          const a = { who: short(e.who), pnl: Math.round(e.pnl), lev: e.leverage ?? 0, price: quoted(e.price) };
          if (e.kind === "open") this.say(`${name} ${e.side === 1 ? "bought" : "sold"} at ${e.leverage}×`, e.leverage! >= WILD ? "wild" : "trade", e.side === 1 ? "bought" : "sold", a);
          else if (e.kind === "add") this.say(`${name} doubled down. Now ${e.leverage}×`, "wild", "added", a);
          else if (e.kind === "close") this.say(`${name} closed: ${aud(e.pnl)}`, e.pnl >= 0 ? "win" : "loss", "closed", a);
          else if (e.kind === "stop") this.say(`${name}'s stop filled at ${quoted(e.price)}: ${aud(e.pnl)}`, e.pnl >= 0 ? "win" : "loss", "stopped", a);
          else if (e.kind === "take") this.say(`${name} took profit at ${quoted(e.price)}: ${aud(e.pnl)}`, "win", "took", a);
          else if (e.kind === "call") this.say(`MARGIN CALL for ${name}!`, "call", "call", a);
          else if (e.kind === "stopout") this.say(`強制ロスカット! ${name} was stopped out: ${aud(e.pnl)}. Out of the round.`, "bust", "stopout", a);
          else if (e.kind === "zerocut") this.say(`${name} was wiped out and leaves the market.`, "bust", "zerocut", a);
          if (e.kind === "open" && e.leverage! >= WILD) this.pop(e.who, "wild", { lev: e.leverage });
          else if (e.kind === "add") this.pop(e.who, "add", { lev: e.leverage });
          else if (e.kind === "close" || e.kind === "stop" || e.kind === "take") this.pop(e.who, "close", { pnl: Math.round(e.pnl) });
          else if (e.kind === "call" || e.kind === "stopout" || e.kind === "zerocut") this.pop(e.who, e.kind);
          if (e.kind === "stopout" || e.kind === "zerocut") {
            const c = record(e.who);
            if (c) c.busts++;
          }
          award(this, e.who, fromFill(e, !!e.called));
          // `key` joins a mark to its trader in a state, as `you` does in the room; the page never
          // sees it (view() swaps it for a flag), and it is never a cookie.
          if (MARKED.has(e.kind)) {
            this.marks.push({ tick: this.tick, who: short(e.who), face: faceOf(e.who), kind: e.kind, side: e.side ?? 0, key: key(e.who) });
            if (this.marks.length > MARKS_MAX) this.marks.shift();
          }
          log(e.who, e.kind, { mode: this.mode, pair: this.round.pair, price: Number(quoted(e.price)), pnl: Math.round(e.pnl), ...(e.side ? { side: e.side === 1 ? "buy" : "sell", leverage: e.leverage } : {}) });
        }
      }

      end(): void {
        // The bell ends a pause as well as trading; Resume only belongs to a live round.
        this.paused = 0;
        const desk = this.desk;
        const ranking = desk.settle((fill) => award(this, fill.who, fromFill(fill, !!fill.called)));
        // Watchers are on the desk but never ordered, so they get no career.
        // Each trader's score: the % result less the cost of each forced cut and of ending bankrupt (ADR 0029, 0080); the
        // bell ranks by it.
        // A replay's year, named right before the bell, adds its bonus.
        // The year a rewind is "from": its plot's.
        const year = this.mode === "rewind" ? Number(this.round.event!.date.slice(0, 4)) : 0;
        const bonus = (who: string): number => (year ? guessBonus(this.guesses.get(who) ?? null, year) : 0);
        const points = (who: string): number => {
          const a = desk.account(who);
          return score({ start: START, net: a.balance - a.debt, cuts: a.cuts }) + bonus(who);
        };
        ranking.sort((a, b) => points(b.who) - points(a.who));
        const humans = ranking.filter((r) => !bot(r.who) && desk.account(r.who).traded);
        for (const r of humans) {
          const a = desk.account(r.who);
          const financing = Math.round(a.financing);
          const interest = Math.round(a.interest);
          this.debriefs.set(key(r.who), {
            // The result before financing and interest includes spread and zero-cut protection.
            // Use whole dollars consistently so the displayed money reconciles exactly.
            beforeFees: r.net - START + financing + interest, financing, interest,
            balance: a.balance, debt: a.debt, net: r.net, cuts: a.cuts,
            ...scoreBreakdown({ start: START, net: r.net, cuts: a.cuts }),
            bonus: bonus(r.who), score: Math.round(points(r.who) * 10) / 10,
            whatIf: this.whatIf(a.trades),
          });
          award(this, r.who, fromBell({ rewind: this.mode === "rewind", net: r.net, start: START, yearRight: !!year && this.guesses.get(r.who) === year }));
          const c = record(r.who)!;
          c.rounds++;
          c.profit += r.net - START;
          c.points += points(r.who);
          c.recent = [...(c.recent ?? []), Math.round(points(r.who) * 10) / 10].slice(-RECENT);
          c.best = Math.max(c.best, r.net - START);
          if (r === humans[0] && humans.length > 1) c.wins++;
        }
        // The bell's result is final and is shown at once, so it is on disk
        // before any page can see it: a crash after the bell keeps it.
        if (humans.length) writeCareer();
        // The bell ranks the bots and everyone who traded, then lists, unranked,
        // everyone still on the tab when it rang who sat the round out; a
        // passer-by who left is not named.
        const here = new Set(this.listeners().map((l) => l.who));
        const sat = (who: string): boolean => !bot(who) && !desk.account(who).traded;
        const aside = (who: string): number => Number(sat(who));
        const shown = ranking.filter((r) => !sat(r.who) || here.has(r.who)).sort((a, b) => aside(a.who) - aside(b.who));
        this.result = { ranking: shown.map((r) => ({ key: key(r.who), code: short(r.who), name: nameOf(r.who), draw: drawOf(r.who), face: faceOf(r.who), balance: r.net, score: Math.round(points(r.who) * 10) / 10, guess: this.guesses.get(r.who) ?? null, bonus: bonus(r.who), sat: sat(r.who) })), reveal: this.reveal, facts: this.facts };
        // each duel decided on the round's score, the higher winning; equal is a draw (ADR 0095)
        const duels = this.duels.map(([a, b]) => {
          const [pa, pb] = [points(a), points(b)];
          const winner = pa === pb ? null : pa > pb ? a : b;
          if (winner) this.say(`${nameOf(winner)} won the duel against ${nameOf(winner === a ? b : a)}.`, "win", "duel-won", { who: short(winner), them: short(winner === a ? b : a) });
          else this.say(`${nameOf(a)} and ${nameOf(b)} drew their duel.`, "info", "duel-drawn", { who: short(a), them: short(b) });
          return { a: short(a), b: short(b), winner: winner && short(winner), keys: [key(a), key(b)] };
        });
        this.result.duels = duels;
        log(null, "end", { mode: this.mode, ranking: ranking.map((r) => [short(r.who), r.net]) });
        this.phase = "break";
        this.breakLeft = BREAK_TICKS;
        this.breakElapsed = 0;
      }

      // Each tick moves the price, lets the bots act, enforces the rules and
      // sends the new state to everyone on this tab.
      // One beat of the clock. `quiet` holds back a trading step's message, so at 2× the second step sends both prices
      // in one (ADR 0085); the bell, the countdown and a pause always speak.
      step(quiet = false): void {
        if (this.phase === "lobby") return;
        if (this.phase === "countdown") {
          const go = --this.countdown <= 0;
          if (go) this.start();
          return this.broadcast(go);
        }
        if (this.phase === "break") {
          this.breakElapsed++;
          const over = --this.breakLeft <= 0;
          if (over) this.afterBell();
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
        // Headlines, each on its day: a Random's situation (ADR 0027), or a
        // replay's clues before its famous day (ADR 0030); enough, read with
        // care, to see it coming.
        // headlines and news come on the first tick of a unit: a day for a rewind's clues, a candle for a random's stories
        const unit = this.round.unit;
        if (this.tick % unit === 1) {
          const day = Math.floor((this.tick - 1) / unit);
          const { situation, event } = this.round;
          const words = situation ? T.en.situations[situation].headlines : event ? T.en.clues[event.date] : [];
          this.round.headlines?.forEach((h, i) => {
            if (h.day !== day) return;
            // A rewind's clue goes out by number, not by the date it leads to
            // (ADR 0050): the date is the answer to Name That Year.
            const clue = event ? clueDates("en").indexOf(event.date) : -1;
            const at: Record<string, string | number> = situation ? { situation, n: i } : { clue, n: i };
            this.say(words[i], "news", situation ? "headline" : "clue", at);
            this.headline = situation ? { situation, n: i } : { clue, n: i };
          });
          // A Random round's own news (ADR 0064, 0085): a named release on its day, which the prices then follow, or do not,
          // and a walked-back one told again when it turns. It goes in the feed and is pinned over the chart like a
          // headline. Which way it pushes the pair is never sent; the release, its currency and its outcome are what a
          // trader would read, and the page words them.
          for (const n of this.round.news ?? []) {
            const back = n.back && day === n.day + BACK_AFTER;
            if (n.day !== day && !back) continue;
            if (n.kind && n.cur && n.outcome) {
              const args = { kind: n.kind, cur: n.cur, outcome: back ? "back" : n.outcome };
              this.say(`${n.cur} ${n.kind}: ${args.outcome}`, "news", "release", args);
              this.headline = { release: args };
            } else if (!back) {
              const story = storyOf(n);
              this.say(T.en.stories[story], "news", "story", { n: story });
              this.headline = { story };
            }
          }
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
        if (!quiet) this.broadcast();
      }

      apply(who: string, action: Action): string | null {
        if (this.phase === "lobby") return "The market is closed. Press Start to begin a round.";
        // In the countdown the price stands at the open: a player may place
        // and take back an order, but not pray to or borrow against it.
        if (this.phase === "countdown" && (action.kind === "pray" || action.kind === "borrow" || action.kind === "repay")) return "Trading opens when the countdown ends.";
        if (this.phase !== "trade" && this.phase !== "countdown") return "The market is closed. Next round soon.";
        if (this.paused) return "The round is paused. Orders wait until it resumes.";
        const desk = this.desk;
        desk.join(who);
        if (action.kind === "pray") {
          // Which way, for a rise or for a fall, changes the words and nothing else: the
          // chart never hears it (ADR 0064). Each way is counted on its own, so the first
          // prayer of each is told, whichever came first.
          const way = action.way;
          const n = (this.prays.get(`${who}|${way}`) ?? 0) + 1;
          this.prays.set(`${who}|${way}`, n);
          log(who, "pray", { mode: this.mode, times: n, way: way === 1 ? "rise" : "fall" });
          this.pop(who, "pray", { way });
          if (n === 1 || n % 10 === 0) this.say(`${nameOf(who)} is praying for the chart to ${way === 1 ? "rise" : "fall"} (×${n}). It does nothing.`, "pray", way === 1 ? "prayed-rise" : "prayed-fall", { who: short(who), n });
          return null;
        }
        if (action.kind === "stop" || action.kind === "take") {
          const refused = action.kind === "stop" ? desk.stopAway(who, action.pct) : desk.takeAway(who, action.pct);
          const pos = desk.account(who).pos;
          const at = (action.kind === "stop" ? pos?.stop : pos?.take) ?? null;
          if (!refused) log(who, `${action.kind}-set`, { mode: this.mode, at: at === null ? null : Number(quoted(at)) });
          return refused;
        }
        if (action.kind === "pend" || action.kind === "unpend") {
          const refused = action.kind === "pend" ? desk.pend(who, action) : desk.unpend(who);
          const p = desk.account(who).pending;
          if (!refused && this.pendingNotices.delete(who)) this.feedVersion++;
          if (!refused) log(who, action.kind, { mode: this.mode, ...(p ? { type: p.type, at: Number(quoted(p.at)), leverage: p.leverage, share: p.share } : {}) });
          return refused;
        }
        // Emergency credit (ADR 0080): a step drawn or repaid, said in the feed, since a room sees who is in debt.
        if (action.kind === "borrow" || action.kind === "repay") {
          const refused = action.kind === "borrow" ? desk.borrow(who) : desk.repay(who);
          if (refused) return refused;
          const debt = Math.round(desk.account(who).debt);
          award(this, who, fromCredit(action.kind, debt));
          if (action.kind === "borrow") {
            this.say(`${nameOf(who)} drew ${aud(STEP)} of emergency credit. Owes ${aud(debt)}.`, "wild", "borrowed", { who: short(who), amount: STEP, debt });
            this.pop(who, "borrow");
          } else this.say(`${nameOf(who)} repaid credit. Owes ${aud(debt)}.`, "info", "repaid", { who: short(who), debt });
          log(who, action.kind, { mode: this.mode, debt });
          return null;
        }
        const out = action.kind === "close" ? desk.close(who) : desk.order(who, action.side, action.leverage, action.share, { sl: action.sl, tp: action.tp });
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
          return { who: p, id: short(p), name: nameOf(p), draw: drawOf(p), face: faceOf(p), bot: !!bot(p), motto: bot(p)?.motto, equity: Math.round(desk.equity(p) - a.debt), side: a.pos?.side ?? 0, leverage: a.pos?.leverage ?? 0, out: a.out };
        });
        traders.sort((a, b) => b.equity - a.equity);
        // what every view of this broadcast shares, worked out once rather than once per page
        return { traders, hall: hallRows(), here: headCounts(), calendar: this.calendarView(), pops: this.pops.map(({ at: _at, ...p }) => p) };
      }

      // What one visitor sees: the shared chart, everyone's standing, and
      // their own account in full. Other people's positions show side and
      // leverage but not their stops, which would be a gift to the room.
      // Pages are sent the whole price history when they join or a round
      // changes phase, and otherwise only the newest price, from `from` on.
      // A delta (`from` above 0) leaves out what a page already has: the broker's fixed numbers and the lists of plots
      // and pairs, which never change, and the feed unless `withFeed`; the page keeps its last copy of each.
      view(who: string, from = 0, shared = this.room(), withFeed = true) {
        const whole = from === 0;
        const { desk, round, tick } = this;
        const mine = desk.players().includes(who) ? desk.account(who) : null;
        const me = key(who);
        const state = {
          mode: this.mode,
          phase: this.phase,
          countdown: Math.ceil((this.countdown * TICK_MS) / 1000),
          speed: this.speed,
          startedBy: this.startedBy && nameOf(this.startedBy),
          startedCode: this.startedBy && short(this.startedBy),
          // Whether this visitor may cancel or end the round for everyone.
          rules: this.startedBy !== null && this.mayRule(who),
          ironman: this.ironman,
          headline: this.headline,
          // Random's calendar (ADR 0085), every release with its day and hour, and the outcome of those already told;
          // what is still to come says nothing of how it will go
          calendar: shared.calendar,
          // a round's chart: the indicators, and its five days named D1 to D5
          chart: { studies: true, days: "count" as const },
          // the clock for the round's phase; the page counts the day and hour, or the seconds, from the ticks it has
          clock: { key: this.phase === "trade" ? "clockDay" as const : this.phase === "countdown" ? "clockOpens" as const : this.phase === "lobby" ? "clockLobby" as const : "clockClosed" as const },
          // Seconds left in a pause, or null while the market runs.
          paused: this.paused ? Math.ceil((this.paused * TICK_MS) / 1000) : null,
          startedDraw: this.startedBy && drawOf(this.startedBy),
          round: this.count,
          pair: round.pair,
          // Every pair a Random round may start from, for its lobby's choice; Rewind has none.
          pairs: !whole ? undefined : this.mode === "random" ? ALL_PAIRS : null,
          // Rewind's plots, by number and no more: which plot is on show, of how many. What a
          // plot is, and when, stays secret until the bell. Random has none.
          rewindPlots: !whole ? undefined : this.mode === "rewind" ? REWIND_PLOTS : null,
          rewindPlot: this.mode === "rewind" ? EVENTS.findIndex((e) => e.id === round.event?.id) + 1 : null,
          // the size of a pip, which the page reads the spread in (ADR 0094)
          pip: pipOf(round.pair),
          simulated: round.source === "simulation",
          tick,
          total: round.prices.length - 1,
          steps: CANDLE,
          dayTicks: DAY_TICKS,
          start: START,
          from,
          // The market's two days before the open, sent whole with the round's first
          // message and whenever the page asks for everything (ADR 0062).
          history: from === 0 ? round.history : undefined,
          prices: round.prices.slice(from, tick + 1),
          breakLeft: Math.ceil((this.breakLeft * TICK_MS) / 1000),
          you: {
            ...youOn(desk, who),
            // the credit's own rule in apply: a trading round, not its countdown, and not paused
            lending: this.phase === "trade" && !this.paused,
            guess: this.guesses.get(who) ?? null,
            pending: mine?.pending ?? null,
            // the achievements this person has earned, by name, in the order of FEATS (ADR 0082)
            feats: FEATS.filter((f) => career[key(who)]?.feats?.includes(f)),
            // the round's closed trades, newest first, the last 20: a player's own, never anyone else's (ADR 0081)
            trades: (mine?.trades ?? []).slice(-20).reverse(),
          },
          traders: shared.traders.map(({ who: p, ...t }) => ({ ...t, you: p === who })),
          feed: whole || withFeed ? (this.pendingNotices.has(who) ? [this.pendingNotices.get(who)!, ...this.feed] : this.feed) : undefined,
          pops: shared.pops,
          marks: this.marks.map(({ key: k, ...m }) => ({ ...m, you: k === me })),
          // a duel you are in, or a challenge made to you, by short code; never anyone's cookie (ADR 0095)
          duel: (() => {
            const pair = this.duels.find(([x, y]) => x === who || y === who);
            if (pair) return { with: short(pair[0] === who ? pair[1] : pair[0]) };
            const from = this.challenges.get(who);
            return from ? { from: short(from) } : null;
          })(),
          result: this.result && { ...this.result, duels: this.result.duels?.map(({ keys, ...d }) => ({ ...d, you: keys.includes(me) })), debrief: this.debriefs.get(me) ?? null, ranking: this.result.ranking.map(({ key: k, ...r }) => ({ ...r, you: k === me })) },
          career: hallFor(me, shared.hall),
          leverages: whole ? LEVERAGES : undefined,
          desk: whole ? DESK : undefined,
          minRounds: whole ? MIN_ROUNDS : undefined,
          ...quote(desk.price),
          // How many people are on each tab, for the tab labels.
          here: shared.here,
        };
        return state satisfies Sent<RoundState>;
      }

      // The room is worked out once per broadcast and shared by every view.
      // During the break nothing moves but the clock, so after the bell's full
      // message the pages are sent only an empty price list.
      // `back` sends that many earlier prices too, the ones a quiet step held back.
      broadcast(full = false, except?: Listener, back = 0): void {
        const shared = this.room();
        const from = full ? 0 : this.phase === "break" ? this.tick + 1 : Math.max(0, this.tick - back);
        for (const l of this.listeners()) {
          if (l === except) continue;
          const withFeed = l.feedSeen !== this.feedVersion;
          l.feedSeen = this.feedVersion;
          l.res.write(sseData(this.view(l.who, from, shared, withFeed)));
        }
      }
    }

    const markets = Object.fromEntries(MODES.map((m) => [m, new Market(m)])) as Record<Mode, Market>;
    // Live (ADR 0087): one market on real prices that never closes, its accounts kept on the volume.
    // How many people have a tab open, by tab, however many pages each has; one count for every view.
    const peopleOn = (mode: Listener["mode"]): number => new Set([...listeners].filter((l) => l.mode === mode).map((l) => l.who)).size;
    const headCounts = (): Record<string, number> => ({ ...Object.fromEntries(MODES.map((m) => [m, peopleOn(m)])), live: peopleOn("live") });
    // A person's name and draw from their career key alone, for Live's board after a restart: what they chose, or the
    // draw their cookie's hash gives, whose second byte is the key's third and fourth hex characters.
    const nameAt = (k: string): { name: string; draw: Draw | null } => {
      // a house trader goes by its own name, as in the rounds
      if (bot(k)) return { name: nameOf(k), draw: null };
      const c = chosen[k];
      if (typeof c === "string") return { name: c, draw: null };
      const draw = c ?? Number.parseInt(k.slice(2, 4), 16) % GIVEN.length;
      return { name: drawn("en", draw), draw };
    };
    const liveMarket = new Live(DATA_DIR, { named, key, short, name: nameOf, draw: drawOf, face: faceOf, faceAt, nameAt }, {
      clock, storage, quotes: options.quotes ?? new Feed(undefined, clock.now, env.LIVE_FEED), news: options.news, pollMs: Number(env.LIVE_POLL_MS ?? 5000),
      // an agent playing through MCP has no page open, but Live must keep its prices moving for it
      watching: () => peopleOn("live") + mcp.active(),
      onChange: () => sendLive(),
      log: (who, ev, fields) => log(who, ev, fields),
    });
    disposeMarket = () => liveMarket.dispose();
    // AI agents play Live through MCP at /mcp: each session one new player, named "Agent" and a short code by the same
    // rules as a person's name, trading through Live's own actions (src/mcp.ts)
    const mcp: Mcp = new Mcp({
      join: (who) => {
        liveMarket.agents.add(key(who));
        const named = rename(who, `Agent ${short(who)}`);
        return "error" in named ? `Agent ${short(who)}` : named.name;
      },
      // an agent's look or action wakes Live's price polling, which a page starts on opening the tab
      view: (who) => (liveMarket.wake(), liveMarket.view(who, headCounts()) as unknown as Record<string, unknown>),
      act: (who, input) => {
        liveMarket.wake();
        const refused = liveMarket.act(who, input);
        log(who, refused ? "refused" : "agent", { mode: "live", action: input.kind, ...(refused ? { why: refused } : {}) });
        if (!refused) sendLive();
        return refused;
      },
      isPair,
      now: () => clock.now(),
    });
    function sendLive(except?: Listener): void {
      const here = headCounts();
      for (const l of listeners) if (l.mode === "live" && l !== except) l.res.write(sseData(liveMarket.view(l.who, here)));
    }
    // The tabs' old ids still lead to them (ADR 0091): replay and simulation, the ids before the tabs were renamed
    // Rewind and Random, history and situation before that, and marathon, Live's id before it was renamed.
    const OLD: Record<string, Mode | "live"> = { replay: "rewind", history: "rewind", simulation: "random", scenario: "random", marathon: "live" };
    // Any mode a page or link asks for, old or new, as the id the server uses now; anything unknown is Rewind.
    const tabOf = (value: unknown): Mode | "live" | "tutorial" => {
      if (value === "live" || value === "tutorial") return value;
      if (typeof value === "string" && Object.hasOwn(OLD, value)) return OLD[value];
      return MODES.includes(value as Mode) ? (value as Mode) : "rewind";
    };
    // the round market a mode names, Rewind when it names Live or the tutorial, which have none
    const modeOf = (value: unknown): Mode => { const tab = tabOf(value); return tab === "live" || tab === "tutorial" ? "rewind" : tab; };

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
      entry.used = clock.now();
      return entry.t;
    }
    repeat(() => {
      for (const [who, e] of tutorials) if (clock.now() - e.used > 3_600_000) tutorials.delete(who);
    }, 600_000).unref();

    function tutorialView(who: string) {
      const t = tutorialOf(who);
      const a = t.desk.account("me");
      const l = t.lesson();
      const state = {
        mode: "tutorial" as const,
        phase: t.moving() ? "moving" as const : "waiting" as const,
        round: t.runs,
        pair: "USD/JPY",
        pip: pipOf("USD/JPY"),
        simulated: true,
        from: 0,
        prices: t.prices,
        // The chart fits whatever has played so far, a candle every 4 ticks and a grid line every five candles; the
        // tutorial has no days, so its "day" is only that grid.
        total: Math.max(40, t.prices.length - 1),
        tick: t.prices.length - 1,
        steps: 4,
        dayTicks: 20,
        start: START,
        transport: t.transport,
        clock: { key: "clockTutorial" as const },
        // a beginner's chart: plain, and its grid lines every five candles carry no day
        chart: { studies: false, days: "none" as const },
        lesson: { id: l.id, moves: t.moves, next: l.allow({ kind: "next" }, t) === null, n: Math.min(t.index, LESSONS.length - 1) + 1, of: LESSONS.length, title: l.title, text: l.text, task: l.task, plan: l.plan, finished: t.finished() },
        // credit while the price stands still for the player's move; a finished tutorial lends no more, its last lesson
        // leaving the player bankrupt, the credit's teaching done
        you: { ...youOn(t.desk, who, "me"), lending: !t.moving() && !t.finished() },
        traders: [],
        feed: t.feed,
        pops: [],
        result: null,
        // the same hall as a market's, so the page draws it the same way (ADR 0085)
        career: hallFor(key(who)),
        leverages: LEVERAGES,
        desk: DESK,
        minRounds: MIN_ROUNDS,
        ...quote(t.price()),
        here: headCounts(),
      };
      return state satisfies TutorialState;
    }
    function sendTutorial(who: string, except?: Listener): void {
      const watching = [...listeners].filter((l) => l !== except && l.mode === "tutorial" && l.who === who);
      // Building a view marks it as used, so an internal tick must not keep an abandoned tutorial alive.
      if (!watching.length) return;
      const text = sseData(tutorialView(who));
      for (const l of watching) l.res.write(text);
    }

    // Lobby prices stand still, but presence and the right to end a round can
    // change at any time. Tell idle pages on every tab as well as trading ones.
    // What a request needs of a tab, whatever kind of market it is: the visitor's state, what happens when they open
    // its page, and anything after the page has its first state. Routing reads the tab from this table, not by kind.
    type Room = { view: (who: string) => object; enter: (who: string) => void; opened: () => void };
    const roundRoom = (market: Market): Room => ({
      view: (who) => market.view(who),
      enter: (who) => {
        // opening the tab joins the round in progress with a fresh account, and the room hears it
        if (market.phase !== "break" && !market.desk.players().includes(who)) {
          market.desk.join(who);
          market.say(`${nameOf(who)} entered the market.`, "info", "entered", { who: short(who) });
        }
      },
      // a page opened or refreshed on Random's lobby brings the latest rate, without holding the page for the fetch
      // (ADR 0085); refreshLobby redraws the round only if the rate has moved, and the room is sent the new one
      opened: () => {
        if (market.mode === "random" && market.phase === "lobby") void market.refreshLobby().then(() => market.broadcast()).catch(() => {});
      },
    });
    const rooms: Record<Mode | "live" | "tutorial", Room> = {
      rewind: roundRoom(markets.rewind),
      random: roundRoom(markets.random),
      // Live polls for prices only while someone has its tab open (ADR 0087)
      live: { view: (who) => liveMarket.view(who, headCounts()), enter: () => liveMarket.wake(), opened: () => {} },
      tutorial: { view: (who) => tutorialView(who), enter: () => {}, opened: () => {} },
    };

    // Every page on every tab redraws: a person entered, left, or renamed themselves or their face.
    function broadcastAll(except?: Listener): void {
      for (const m of MODES) markets[m].broadcast(false, except);
      const watching = new Set([...listeners].filter((l) => l.mode === "tutorial").map((l) => l.who));
      for (const who of watching) sendTutorial(who, except);
      sendLive(except);
    }

    repeat(() => {
      // a market at 2× takes a second step while it trades and is not paused (ADR 0085)
      for (const m of MODES) {
        const market = markets[m];
        if (market.speed === 2 && market.phase === "trade" && !market.paused) {
          // two steps, one message carrying both prices; a step that rang the bell has already sent its own
          const before = market.tick;
          market.step(true);
          market.step(true);
          if (market.phase === "trade") market.broadcast(false, undefined, market.tick - before - 1);
        } else market.step();
      }
      for (const [who, e] of tutorials) if (e.t.transport === "playing" && e.t.moving()) {
        e.t.step();
        sendTutorial(who);
      }
    }, TICK_MS).unref();

    // A page is sent fresh each time, since the server writes its words in. A script, the stylesheet or the icon is
    // the same until the next deploy: it carries a hash of its content, so a reload asks only whether it changed and is
    // told no in a few bytes, and it is sent gzipped, worked out once, to a browser that takes it.
    const packed = new Map<string, { tag: string; gz: Buffer }>();
    const send = (res: ServerResponse, [content, type]: [string, string], req?: IncomingMessage): void => {
      if (type === HTML || !req) {
        res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
        return void res.end(content);
      }
      let file = packed.get(content);
      if (!file) packed.set(content, (file = { tag: `"${createHash("sha256").update(content).digest("base64url").slice(0, 16)}"`, gz: gzipSync(content) }));
      const headers = { "content-type": type, "cache-control": "no-cache", etag: file.tag, vary: "accept-encoding" };
      if (req.headers["if-none-match"] === file.tag) {
        res.writeHead(304, headers);
        return void res.end();
      }
      if (/\bgzip\b/.test(String(req.headers["accept-encoding"] ?? ""))) {
        res.writeHead(200, { ...headers, "content-encoding": "gzip" });
        return void res.end(file.gz);
      }
      res.writeHead(200, headers);
      res.end(content);
    };

    const json = (res: ServerResponse, status: number, data: unknown): void => {
      res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(data));
    };

    // An order is a small JSON object; anything else, or over 1 KB, is refused.
    async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
      const value = await readJson(req, 1024, "{}");
      if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("not an object");
      return value as Record<string, unknown>;
    }

    const HTML = "text/html; charset=utf-8";

    const THEME = `<script>try { const t = localStorage.getItem("theme"); if (t === "light" || t === "dark") document.documentElement.dataset.theme = t; } catch {}</script>`;
    const aboutIn = (lang: Lang): string => {
      const a = ABOUT[lang];
      const body = a.sections.map(([h, ps]) => `<h2>${escape(h)}</h2>${ps.map((p) => `<p>${escape(p)}</p>`).join("")}`).join("");
      const others = LANGS.filter((l) => l !== lang).map((l) => `<a href="${prefix(l)}/about" hreflang="${HTMLLANG[l]}" lang="${HTMLLANG[l]}">${{ en: "English", ja: "日本語", zh: "简体中文" }[l]}</a>`).join(" · ");
      return `<!doctype html><html lang="${HTMLLANG[lang]}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(a.title)}</title>\n${alternates("about")}<link rel="icon" href="/favicon.svg" type="image/svg+xml">${FONTS}<link rel="stylesheet" href="/app.css">${THEME}</head><body class="readme about">${headerIn(lang, false)}<main><p class="logo">${escape(T[lang].ui.logo)}</p><h1>${escape(a.title)}</h1><p class="lead">${escape(a.lead)}</p>${body}<nav class="about-links"><a href="${prefix(lang)}/">${escape(a.back)}</a> · <a href="/readme/">${escape(a.readme)}</a></nav><p class="about-langs">${others}</p></main><footer>${escape(T[lang].ui.footer)}</footer><script type="module" src="/about-controls.js"></script></body></html>`;
    };
    const readme = `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>About Losscut!</title><link rel="icon" href="/favicon.svg" type="image/svg+xml">${FONTS}<link rel="stylesheet" href="/app.css">${THEME}</head><body class="readme"><main>${renderMarkdown(read("README.md"))}<p><a href="/">Back to the market</a></p></main><footer>${escape(T.en.ui.footer)}</footer></body></html>`;
    // The page's scripts, each served from public/ under its own name; one list, so a new module is one word here.
    const JS = "text/javascript; charset=utf-8";
    const SCRIPTS = ["requests", "dom", "transport", "account", "chart", "tutorial-ui", "about-controls", "app", "format", "i18n", "names", "indicators", "avatars", "ticket", "art", "tips", "clauses", "plan", "view", "i18n-long", "qrcode"];
    const PAGES: Record<string, [string, string]> = {
      ...Object.fromEntries(SCRIPTS.map((n) => [`/${n}.js`, [read(`public/${n}.js`), JS]])),
      ...Object.fromEntries(LANGS.flatMap((l) => [[`${prefix(l)}/`, [marketIn(l), HTML]], [`${prefix(l)}/about`, [aboutIn(l), HTML]]])),
      "/app.css": [read("public/app.css"), "text/css; charset=utf-8"],
      "/favicon.svg": [read("public/favicon.svg"), "image/svg+xml"],
      // the README's architecture diagram at its path in the repo, so /readme/ and GitHub show the same image
      "/public/architecture.svg": [read("public/architecture.svg"), "image/svg+xml"],
      "/readme": [readme, HTML],
    };

    // The activity log names traders by short code next to what they did, so
    // it is the operator's alone: only the holder of STATS_KEY (a Fly secret,
    // never in the repo) may read it, and anyone else gets the 404 of a path
    // that does not exist. With no key set it is shut to everyone.
    const STATS_KEY = env.STATS_KEY ?? "";
    // The market pages a debugger is served with the console added.
    const DEBUG_PAGES = new Set(LANGS.map((l) => `${prefix(l)}/`));
    const DEBUG_JS: [string, string] = [read("public/debug.js"), "text/javascript; charset=utf-8"];
    // What the debug console can do. Each acts on the server, where the
    // rules live, and changes only what it names: the hall, a round's phase,
    // or the debugger's own account. It is logged with the debugger's code.
    async function debugAction(who: string, kind: string, mode: Mode, input: Record<string, unknown> = {}): Promise<{ ok?: true; error?: string; status?: unknown }> {
      const market = markets[mode];
      const desk = market.desk;
      switch (kind) {
        case "status":
          return { ok: true, status: { here: here(), rooms: MODES.map((m) => ({ mode: m, phase: markets[m].phase, round: markets[m].count, pair: markets[m].round.pair, tick: markets[m].tick, of: markets[m].round.prices.length - 1, event: markets[m].round.event?.title ?? null, from: markets[m].round.days[0] })), fame: Object.keys(career).length, names: Object.keys(chosen).length, live: liveMarket.diagnostics() } };
        case "reset-fame":
          for (const k of Object.keys(career)) delete career[k];
          writeCareer();
          rank();
          for (const m of MODES) markets[m].broadcast();
          return { ok: true };
        case "start":
          if (market.phase === "break") market.ready();
          await market.refreshLobby();
          if (market.phase === "trade") return { error: "Already trading." };
          market.result = null;
          market.feed = [];
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
        // remove one Live account by the six-letter code the board shows, such as a test account left on it
        case "remove-live": {
          const code = typeof input.code === "string" && /^[0-9a-f]{6}$/.test(input.code) ? input.code : undefined;
          const name = typeof input.name === "string" && input.name.trim() ? input.name.trim() : undefined;
          if (!code && !name) return { error: "Give the account's six-letter code or its name on the board." };
          const done = liveMarket.remove({ code, name });
          if (done === "ambiguous") return { error: "Two players share that name; give the code instead." };
          return done ? { ok: true } : { error: "No Live account has that code or name." };
        }
        default:
          return { error: "Unknown debug action." };
      }
    }

    // The optional background music (ADR 0020), served as exact bytes, not
    // text, and in ranges, so a browser starts playing before the whole file
    // arrives and can seek. One fixed file: nothing else in the folder, and
    // no path a request names, is ever read.
    const BGM = readFileSync(join(ROOT, "public/audio/bgm.m4a"));
    // the README's screenshot, at its path in the repo, so /readme/ and GitHub show the same image
    const SHOT = readFileSync(join(ROOT, "public/screenshot.png"));
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
      if (path === "/mcp") {
        const message = req.method === "POST" ? await readJson(req, 64 * 1024, "null").catch(() => undefined) : null;
        if (req.method === "POST" && message === undefined) return json(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error." } });
        const session = req.headers["mcp-session-id"];
        const out = mcp.handle(req.method ?? "GET", typeof session === "string" ? session : undefined, message);
        res.writeHead(out.status, out.headers);
        return void res.end(out.body === null ? undefined : JSON.stringify(out.body));
      }
      if (path === "/api/debug") {
        if (!debug || req.method !== "POST") return json(res, 404, { error: "Not found." });
        const input = await body(req).catch(() => null);
        if (!input) return json(res, 400, { error: "Send JSON." });
        if (typeof input.kind !== "string") return json(res, 400, { error: "Unknown debug action." });
        const out = await debugAction(who, input.kind, modeOf(input.mode), input);
        log(who, "debug", { action: input.kind, mode: modeOf(input.mode), ...(typeof input.code === "string" ? { code: input.code } : {}), ...(typeof input.name === "string" ? { name: input.name } : {}), ...(out.error ? { why: out.error } : {}) });
        return json(res, out.error ? 409 : 200, out);
      }
      if ((req.method === "GET" || req.method === "HEAD") && url.pathname === "/audio/bgm.m4a") return sendAudio(req, res);
      if (req.method === "GET" && url.pathname === "/public/screenshot.png") return void (res.writeHead(200, { "content-type": "image/png", "cache-control": "no-cache" }), res.end(SHOT));
      if (req.method === "GET" && PAGES[url.pathname]) return send(res, PAGES[url.pathname], req);
      if (req.method === "GET" && PAGES[path]) return send(res, PAGES[path], req);
      if (req.method === "GET" && (LOG_PAGES[path] || path === "/api/log") && !operator(url)) {
        return json(res, 404, { error: "Not found." });
      }
      if (req.method === "GET" && LOG_PAGES[path]) return send(res, LOG_PAGES[path]);
      if (req.method === "GET" && path === "/api/log") {
        const rooms = MODES.map((m) => ({ mode: m, round: markets[m].count, pair: markets[m].round.pair, phase: markets[m].phase }));
        return json(res, 200, { here: here(), rooms, recent: recent.slice(-150).toReversed() });
      }

      // Opening a tab opens a stream of its room's state; switching tabs opens a new stream on the other room.
      if (req.method === "GET" && path === "/api/events") {
        const mode = tabOf(url.searchParams.get("mode"));
        const room = rooms[mode];
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
        const listener: Listener = { res, who, mode };
        const already = ids().has(who);
        listeners.add(listener);
        log(who, already ? "tab" : "join", { mode, ...(already ? {} : { here: here() }) });
        room.enter(who);
        res.write(sseData(room.view(who)));
        // The page's close runs later, outside this request; it keeps the ID
        // of the request that opened it, so its join and leave pair up.
        const opened = requests.getStore();
        req.on("close", () => {
          listeners.delete(listener);
          if (!ids().has(who)) requests.run(opened ?? "------", () => log(who, "leave", { here: here() }));
          broadcastAll();
        });
        broadcastAll(listener);
        room.opened();
        return;
      }

      if (req.method === "GET" && path === "/api/state") {
        return json(res, 200, rooms[tabOf(url.searchParams.get("mode"))].view(who));
      }

      // A person's trader name: GET draws one to try, POST chooses one. Every
      // page sees the new name with the next broadcast.
      if (req.method === "GET" && path === "/api/name") return json(res, 200, suggestion(who));
      if (req.method === "POST" && path === "/api/name") {
        const input = await body(req).catch(() => null);
        if (!input) return json(res, 400, { error: "Send JSON." });
        const result = rename(who, input.name);
        if ("error" in result) {
          log(who, "refused", { action: "rename", why: result.error });
          return json(res, result.status, { error: result.error });
        }
        broadcastAll();
        return json(res, 200, result);
      }

      // A person's face: POST chooses one of the plain set; the page draws
      // one to try on from its own copy of them.
      if (req.method === "POST" && path === "/api/face") {
        const input = await body(req).catch(() => null);
        if (!input) return json(res, 400, { error: "Send JSON." });
        const result = reface(who, input.face);
        if ("error" in result) {
          log(who, "refused", { action: "reface", why: result.error });
          return json(res, result.status, { error: result.error });
        }
        broadcastAll();
        return json(res, 200, result);
      }

      if (req.method === "POST" && path === "/api/act") {
        const input = await body(req).catch(() => null);
        if (!input) return json(res, 400, { error: "Send JSON." });
        if (typeof input.kind !== "string") return json(res, 400, { error: "Unknown action." });
        const kind = input.kind;
        // Live's orders go to its own accounts; like every market, the page sends only what the player chose
        const tab = tabOf(input.mode);
        if (tab === "live") {
          const error = liveMarket.act(who, input);
          if (error) {
            log(who, "refused", { mode: "live", action: kind, why: error });
            return json(res, 409, { error });
          }
          sendLive();
          return json(res, 200, { ok: true });
        }
        const action = tradeAction(input);
        if (tab === "tutorial") {
          const t = tutorialOf(who);
          let error: string | null = null;
          // The transport, as on a disc player: play, pause, stop, and the track keys back and skip.
          // Restart, from an older page, is a stop and a play; again starts this lesson over.
          if (kind === "play") t.play();
          else if (kind === "pause") t.pause();
          else if (kind === "stop" && typeof input.pct !== "number") t.stop();
          else if (kind === "restart") {
            t.stop();
            t.play();
          } else if (kind === "again" || kind === "back") {
            error = t.idle();
            if (!error) {
              if (kind === "again") t.restartLesson();
              else t.back();
            }
          } else if (kind === "skip") error = t.skip();
          else if (kind === "next") error = t.act({ kind: "next" });
          else if (action?.kind === "pend" || action?.kind === "unpend") error = "Pending orders aren't part of the tutorial yet. Try one in Rewind, Random or Live.";
          else if (action && action.kind !== "pray") error = t.act(action as Move);
          else if (action) error = "Praying isn't part of the tutorial. It does nothing anyway.";
          else return json(res, 400, { error: "Unknown action." });
          log(who, error ? "refused" : "lesson", { mode: "tutorial", action: kind, lesson: t.lesson().id, ...(error ? { why: error } : {}) });
          sendTutorial(who);
          return json(res, error ? 409 : 200, error ? { error } : { ok: true });
        }
        // only a round market is left here: Live and the tutorial have returned above, so tab is "rewind" or "random"
        const market = markets[tab];
        // A round's controls (ADR 0022): cancel the countdown, end the round,
        // leave it, and close or hold the bell. The market checks who may.
        const control = Object.hasOwn(CONTROLS, kind) ? CONTROLS[kind] : null;
        if (control) {
          // a year must be a whole number the data could hold
          if (kind === "guess" && !(Number.isInteger(input.year) && (input.year as number) >= FIRST_YEAR && (input.year as number) <= new Date().getFullYear())) return json(res, 400, { error: "Name a year from 1999 to now." });
          const error = control(market, who, input);
          if (error) {
            log(who, "refused", { mode: market.mode, action: kind, why: error });
            return json(res, 409, { error });
          }
          // a duel is between two people, so its line names the other by short code (ADR 0095)
          if (kind === "challenge" || kind === "accept") log(who, kind, { mode: market.mode, them: input.code });
          market.broadcast(true);
          return json(res, 200, { ok: true });
        }
        if (kind === "start") {
          // A rejected Start must not redraw the lobby. The request checks
          // membership again after the fetch in case the starter has left.
          if (market.listeners().some((l) => l.who === who)) await market.refreshLobby();
          const error = market.request(who, input.ironman === true);
          if (error) return json(res, 409, { error });
          market.broadcast(true);
          return json(res, 200, { ok: true });
        }
        if (!action) return json(res, 400, { error: "Unknown action." });
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
    const http = createServer((req, res) => {
      const id = randomBytes(3).toString("hex");
      const began = performance.now();
      if (req.method === "POST") {
        res.on("finish", () => {
          const who = req.headers.cookie?.match(/(?:^|;\s*)v=([0-9a-f-]{36})/)?.[1];
          console.log(`[${id}] ${req.method} ${req.url?.split("?")[0]} ${res.statusCode} ${Math.round(performance.now() - began)}ms${who ? ` who=${short(who)}` : ""}`);
        });
      }
      requests.run(id, () => void handle(req, res).catch((error: unknown) => {
        console.error("request failed:", error instanceof Error ? error.message : "unknown error");
        if (!res.headersSent) json(res, 500, { error: "Internal server error." });
        else res.destroy();
      }));
    });

    for (const m of MODES) markets[m].ready();
    // Every page is pinged every 5s so dead connections are found and dropped.
    repeat(() => {
      for (const l of [...listeners]) {
        // A named event keeps the page's liveness clock going even in an idle
        // lobby or tutorial. It carries no market or private account data.
        const ok = l.res.write("event: heartbeat\ndata: {}\n\n");
        if (!ok && l.res.writableLength > 64_000) l.res.destroy();
      }
    }, 5_000).unref();

    let started = false;
    let starting: Promise<void> | null = null;
    let closing: Promise<void> | null = null;
    return {
      async start(port = PORT, host = "0.0.0.0"): Promise<string> {
        if (stopped || started) throw new Error("Application has already started or stopped.");
        started = true;
        starting = new Promise<void>((resolve, reject) => {
          http.once("error", reject);
          http.listen(port, host, () => { http.off("error", reject); resolve(); });
        });
        await starting;
        const address = http.address();
        if (!address || typeof address === "string") throw new Error("Server has no TCP address.");
        console.log(`losscut on :${address.port}, seed ${seed}`);
        return `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${address.port}`;
      },
      stop(): Promise<void> {
        if (closing) return closing;
        stopped = true;
        for (const timer of timers) timer.cancel();
        timers.clear();
        for (const listener of listeners) listener.res.destroy();
        listeners.clear();
        if (saving) writeCareer();
        liveMarket.dispose();
        closing = (async () => {
          await starting?.catch(() => {});
          if (!http.listening) return;
          await new Promise<void>((resolve, reject) => {
            http.close((error) => error ? reject(error) : resolve());
            http.closeAllConnections();
          });
        })();
        return closing;
      },
    };
  } catch (error) {
    stopped = true;
    for (const timer of timers) timer.cancel();
    timers.clear();
    disposeMarket();
    throw error;
  }
}
