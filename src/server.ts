// Losscut!'s server: one shared market, traded live by everyone with the
// page open, plus four house bots. The server owns the price, fills every
// order at the price when it arrives, and enforces margin calls and
// stop-outs; pages only show what it sends (ADR 0010). A round is three
// minutes: a hidden replay of real history, or (every third round) a live
// round from today's rate. The hall of fame is kept on the volume.
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import { type Action, BOTS } from "./bots.ts";
import { BORROW, Desk, type Fill, LEVERAGES, LOANS, START } from "./fx.ts";
import { yen } from "../public/format.js";
import { renderMarkdown } from "./markdown.ts";
import { History, PAIRS, STEPS, live, random, replay, type Pair, type Round } from "./market.ts";

const PORT = Number(process.env.PORT ?? 8080);
const DATA_DIR = process.env.DATA_DIR ?? "/data";
const ROOT = join(import.meta.dirname, "..");
const CAREER_FILE = join(DATA_DIR, "career.json");
const ACTIVITY = join(DATA_DIR, "activity.log");
// Half a second a tick: forty days of nine ticks is three minutes.
const TICK_MS = Number(process.env.TICK_MS ?? 500);
const BREAK_TICKS = 40;
mkdirSync(DATA_DIR, { recursive: true });

const read = (file: string): string => readFileSync(join(ROOT, file), "utf8");
const history = new History(read("data/ecb.csv"));

// A visitor is their cookie; others see them by a trader name drawn from
// it, and the log by a short hash, so nobody types a name, nothing needs
// moderating, and no page or log line carries a cookie (ADR 0010).
const ADJ = ["Lucky", "Panic", "Diamond", "Paper", "Moon", "Margin", "Lonely", "Golden", "Sleepy", "Brave", "Greedy", "Humble", "Shaky", "Bold", "Tiny", "Mighty", "Nervous", "Hopeful", "Reckless", "Cosy", "Midnight", "Salty", "Dizzy", "Sunny"];
const NOUN = ["Yen", "Pip", "Bull", "Bear", "Whale", "Candle", "Franc", "Kiwi", "Aussie", "Loonie", "Swap", "Lot", "Spread", "Chart", "Hedge", "Ticker", "Wick", "Dip", "Peg", "Rally", "Gap", "Fiver", "Penny", "Euro"];
const bot = (who: string) => BOTS.find((b) => b.id === who);
// Hashed on demand: caching would keep an entry for every cookie ever
// seen, and a client without cookies gets a new one each request.
const hash = (who: string): Buffer => createHash("sha256").update(who).digest();
function nameOf(who: string): string {
  const b = bot(who);
  if (b) return b.name;
  const h = hash(who);
  return `${ADJ[h[0] % ADJ.length]} ${NOUN[h[1] % NOUN.length]}`;
}
// Six hex characters tell people apart in the log at a glance; a career
// is filed under sixteen, so two people's careers never merge.
const short = (who: string): string => (bot(who) ? who : hash(who).toString("hex").slice(0, 6));
const key = (who: string): string => (bot(who) ? who : hash(who).toString("hex").slice(0, 16));

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

// The bots trade every few seconds; their trades go to stdout only, so the
// saved record is people and rounds. Their prayers and stop settings are
// left out altogether, as noise.
function log(who: string | null, ev: string, fields: Record<string, unknown> = {}): void {
  const isBot = who !== null && !!bot(who);
  if (isBot && (ev === "pray" || ev === "stop-set")) return;
  const line: Line = { t: new Date().toISOString(), who: who ? short(who) : "server", ...(who ? { name: nameOf(who) } : {}), ev, ...fields };
  const text = JSON.stringify(line);
  console.log(text);
  if (isBot) return;
  recent.push(line);
  recent.splice(0, recent.length - 300);
  try {
    appendFileSync(ACTIVITY, `${text}\n`);
  } catch (error) {
    console.error("could not append to the activity log:", error);
  }
}

// Career results across rounds and restarts: the long-term ranking.
type Career = { name: string; rounds: number; profit: number; wins: number; busts: number; best: number };
const career: Record<string, Career> = existsSync(CAREER_FILE) ? JSON.parse(readFileSync(CAREER_FILE, "utf8")) : {};
// Changes are saved once, just after the code that made them, however
// many careers changed; a failed write is reported and the game goes on.
let saving = false;
function saveCareer(): void {
  if (saving) return;
  saving = true;
  setImmediate(() => {
    saving = false;
    try {
      writeFileSync(`${CAREER_FILE}.tmp`, JSON.stringify(career));
      renameSync(`${CAREER_FILE}.tmp`, CAREER_FILE);
    } catch (error) {
      console.error("could not save the hall of fame:", error);
    }
  });
}

// The round being played, or the break after it.
const seed = Date.now() % 2 ** 31;
const rnd = random(seed);
let count = 0;
let round: Round;
let desk: Desk;
let tick = 0;
let phase: "trade" | "break" = "trade";
let breakLeft = 0;
let result: { ranking: { key: string; name: string; balance: number }[]; reveal: string } | null = null;
// What the bell will say, decided when the round starts.
let reveal = "";
let feed: { text: string; kind: string }[] = [];
const prays = new Map<string, number>();

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
function start(): void {
  count++;
  if (count % 3 === 0) {
    const pair = PAIRS[Math.floor(rnd() * PAIRS.length)];
    const now = todayRate(pair);
    round = live(history, pair, now.rate, rnd);
    reveal = `That was a simulation from ${round.pair} on ${now.date} (${now.source}).`;
  } else {
    round = replay(history, rnd, 0.6);
    reveal = `That was ${round.pair} from ${round.days[0]} to ${round.days.at(-1)}.${round.event ? ` ${round.event.title} (${round.event.date}): ${round.event.note}` : ""}`;
  }
  desk = new Desk(round.prices[0]);
  for (const b of BOTS) desk.join(b.id);
  for (const l of listeners) desk.join(l.who);
  tick = 0;
  phase = "trade";
  result = null;
  feed = [];
  prays.clear();
  say(round.simulated ? `Live round: ${round.pair} from today's real rate. Prices from here on are simulated.` : `Replay: ${round.pair}, forty real trading days. When? Find out at the bell.`, "info");
  log(null, "start", { pair: round.pair, from: round.days[0], event: round.event?.title ?? null, simulated: round.simulated });
  void refreshToday();
}

function say(text: string, kind: string): void {
  feed.unshift({ text, kind });
  feed.splice(14);
}

// Turn the desk's events into the room's feed. A stop-out is everyone's
// business; that is the point of trading in the same room.
function report(events: Fill[]): void {
  for (const e of events) {
    const name = nameOf(e.who);
    if (e.kind === "open") say(`${name} ${e.side === 1 ? "bought" : "sold"} at ${e.leverage}×`, e.leverage! >= 400 ? "wild" : "trade");
    else if (e.kind === "add") say(`${name} doubled down. Now ${e.leverage}×`, "wild");
    else if (e.kind === "close") say(`${name} closed: ${yen(e.pnl)}`, e.pnl >= 0 ? "win" : "loss");
    else if (e.kind === "stop") say(`${name}'s stop filled at ${fmt(e.price)}: ${yen(e.pnl)}`, e.pnl >= 0 ? "win" : "loss");
    else if (e.kind === "call") say(`MARGIN CALL for ${name}!`, "call");
    else if (e.kind === "stopout") say(`強制ロスカット! ${name} was stopped out: ${yen(e.pnl)}`, "bust");
    else if (e.kind === "zerocut") say(`${name} was wiped out and leaves the market.`, "bust");
    if (e.kind === "stopout" || e.kind === "zerocut") {
      const c = record(e.who);
      if (c) c.busts++;
    }
    log(e.who, e.kind, { pair: round.pair, price: Number(fmt(e.price)), pnl: Math.round(e.pnl), ...(e.side ? { side: e.side === 1 ? "buy" : "sell", leverage: e.leverage } : {}) });
  }
}

const digits = (): number => (round.pair.endsWith("JPY") ? 3 : 5);
const fmt = (p: number): string => p.toFixed(digits());

// Only people who trade have careers. A change is saved at once (the
// file is small), so a bust survives a crash mid-round, and the top ten
// are worked out again only then.
let fame: (Career & { key: string })[] = [];
function rank(): void {
  fame = Object.entries(career).map(([k, c]) => ({ key: k, ...c })).sort((a, b) => b.profit - a.profit).slice(0, 10);
}
rank();
function record(who: string): Career | null {
  if (bot(who)) return null;
  career[key(who)] ??= { name: nameOf(who), rounds: 0, profit: 0, wins: 0, busts: 0, best: 0 };
  saveCareer();
  queueMicrotask(rank);
  return career[key(who)];
}

function end(): void {
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
  const shown = ranking.filter((r) => bot(r.who) || desk.account(r.who).traded);
  result = { ranking: shown.map((r) => ({ key: key(r.who), name: nameOf(r.who), balance: r.net })), reveal };
  log(null, "end", { ranking: ranking.map((r) => [short(r.who), r.net]) });
  phase = "break";
  breakLeft = BREAK_TICKS;
}

// The clock. Each tick moves the price, lets the bots act, enforces the
// rules and sends the new state to everyone.
setInterval(() => {
  if (phase === "break") {
    const next = --breakLeft <= 0;
    if (next) start();
    return broadcast(next);
  }
  tick++;
  report(desk.mark(round.prices[tick]));
  const seen = round.prices.slice(0, tick + 1);
  for (const b of BOTS) {
    const action = b.act(desk, b.id, seen, rnd);
    if (action) apply(b.id, action);
  }
  if (tick >= round.prices.length - 1) {
    end();
    return broadcast(true);
  }
  broadcast();
}, TICK_MS).unref();

function apply(who: string, action: Action): string | null {
  if (phase !== "trade") return "The market is closed. Next round soon.";
  desk.join(who);
  if (action.kind === "pray") {
    prays.set(who, (prays.get(who) ?? 0) + 1);
    log(who, "pray", { times: prays.get(who) });
    if (prays.get(who) === 1 || prays.get(who)! % 10 === 0) say(`${nameOf(who)} is praying to the chart (×${prays.get(who)}). It does nothing.`, "pray");
    return null;
  }
  if (action.kind === "stop") {
    const pos = desk.account(who).pos;
    if (action.pct !== null && !(action.pct > 0 && action.pct <= 50)) return "A stop must be between 0% and 50% away.";
    const at = pos && action.pct !== null ? desk.price * (1 - (pos.side * action.pct) / 100) : null;
    const refused = desk.stop(who, at);
    if (!refused) log(who, "stop-set", { at: at === null ? null : Number(fmt(at)) });
    return refused;
  }
  if (action.kind === "borrow") {
    const refused = desk.borrow(who);
    if (refused) return refused;
    const first = desk.account(who).debt === BORROW;
    say(first ? `${nameOf(who)} borrowed ${yen(BORROW)} from Dad's savings. "Just until the market turns."` : `${nameOf(who)} borrowed from Dad again. That was the last of it.`, "wild");
    log(who, "borrow", { debt: desk.account(who).debt });
    return null;
  }
  const out = action.kind === "close" ? desk.close(who) : desk.order(who, action.side, action.leverage, action.stake);
  if (typeof out === "string") return out;
  report(out);
  return null;
}

const listeners = new Set<{ res: ServerResponse; who: string }>();

// What one visitor sees: the shared chart, everyone's standing, and their
// own account in full. Other people's positions show side and leverage
// but not their stops, which would be a gift to the room. Pages are sent
// the whole price history when they join or a round changes phase, and
// otherwise only the newest price, from `from` on.
//
// The room is the bots, people with the page open, and anyone still
// holding a position; someone who looked in and left is not listed.
function room() {
  const open = ids();
  const traders = desk.players().filter((p) => bot(p) || open.has(p) || desk.account(p).pos).map((p) => {
    const a = desk.account(p);
    return { who: p, id: short(p), name: nameOf(p), bot: !!bot(p), motto: bot(p)?.motto, equity: Math.round(desk.equity(p) - a.debt), side: a.pos?.side ?? 0, leverage: a.pos?.leverage ?? 0, out: a.out };
  });
  traders.sort((a, b) => b.equity - a.equity);
  return { traders };
}

function view(who: string, from = 0, shared = room()) {
  const mine = desk.players().includes(who) ? desk.account(who) : null;
  const me = key(who);
  return {
    phase,
    round: count,
    pair: round.pair,
    digits: digits(),
    simulated: round.simulated,
    tick,
    total: round.prices.length - 1,
    steps: STEPS,
    start: START,
    from,
    prices: round.prices.slice(from, tick + 1),
    breakLeft: Math.ceil((breakLeft * TICK_MS) / 1000),
    you: {
      name: nameOf(who),
      balance: mine?.balance ?? START,
      equity: Math.round(mine ? desk.equity(who) : START),
      pnl: Math.round(mine ? desk.pnl(who) : 0),
      level: mine?.pos ? Math.round(desk.level(who) * 100) : null,
      out: mine?.out ?? false,
      debt: mine?.debt ?? 0,
      loansLeft: LOANS - (mine?.debt ?? 0) / BORROW,
      broke: mine ? desk.broke(who) : false,
      cuts: mine?.cuts ?? 0,
      pos: mine?.pos ? { side: mine.pos.side, entry: mine.pos.entry, leverage: mine.pos.leverage, margin: mine.pos.margin, stop: mine.pos.stop } : null,
    },
    traders: shared.traders.map(({ who: p, ...t }) => ({ ...t, you: p === who })),
    feed,
    result: result && { ...result, ranking: result.ranking.map(({ key: k, ...r }) => ({ ...r, you: k === me })) },
    career: fame.map(({ key: k, ...c }) => ({ ...c, you: k === me })),
    leverages: LEVERAGES,
  };
}

// The room is worked out once per broadcast and shared by every view.
// During the break nothing moves but the clock, so after the bell's full
// message the pages are sent only an empty price list.
function broadcast(full = false): void {
  const shared = room();
  for (const l of listeners) l.res.write(`data: ${JSON.stringify(view(l.who, full ? 0 : phase === "break" ? tick + 1 : tick, shared))}\n\n`);
}

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
const readme = `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>About Losscut!</title><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/app.css"></head><body class="readme"><main>${renderMarkdown(read("README.md"))}<p><a href="/">Back to the market</a></p></main></body></html>`;
const PAGES: Record<string, [string, string]> = {
  "/": [read("public/index.html"), HTML],
  "/app.js": [read("public/app.js"), "text/javascript; charset=utf-8"],
  "/app.css": [read("public/app.css"), "text/css; charset=utf-8"],
  "/format.js": [read("public/format.js"), "text/javascript; charset=utf-8"],
  "/favicon.svg": [read("public/favicon.svg"), "image/svg+xml"],
  "/readme": [readme, HTML],
};

// The activity log names traders by short code next to what they did, so
// it is the operator's alone: only the holder of STATS_KEY (a Fly secret,
// never in the repo) may read it, and anyone else gets the 404 of a path
// that does not exist. With no key set it is shut to everyone.
const STATS_KEY = process.env.STATS_KEY ?? "";
const LOG_PAGES: Record<string, [string, string]> = {
  "/log": [read("public/log.html"), HTML],
  "/log.js": [read("public/log.js"), "text/javascript; charset=utf-8"],
};
function operator(url: URL): boolean {
  const given = Buffer.from(url.searchParams.get("key") ?? "");
  const key = Buffer.from(STATS_KEY);
  return key.length > 0 && given.length === key.length && timingSafeEqual(given, key);
}
// Everyone with the page open, however many tabs.
const ids = (): Set<string> => new Set([...listeners].map((l) => l.who));
const here = (): number => ids().size;

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;
  let who = req.headers.cookie?.match(/(?:^|;\s*)v=([0-9a-f-]{36})/)?.[1] ?? null;
  if (!who) {
    who = randomUUID();
    res.setHeader("set-cookie", `v=${who}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`);
  }

  if (req.method === "GET" && PAGES[path]) return send(res, PAGES[path]);
  if (req.method === "GET" && (LOG_PAGES[path] || path === "/api/log") && !operator(url)) {
    return json(res, 404, { error: "Not found." });
  }
  if (req.method === "GET" && LOG_PAGES[path]) return send(res, LOG_PAGES[path]);
  if (req.method === "GET" && path === "/api/log") {
    return json(res, 200, { here: here(), round: count, pair: round.pair, phase, recent: recent.slice(-150).toReversed() });
  }

  // Opening the page joins the round in progress with a fresh account.
  if (req.method === "GET" && path === "/api/events") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
    const listener = { res, who };
    const already = ids().has(who);
    listeners.add(listener);
    if (!already) log(who, "join", { here: here() });
    if (phase === "trade" && !desk.players().includes(who)) {
      desk.join(who);
      say(`${nameOf(who)} entered the market.`, "info");
    }
    res.write(`data: ${JSON.stringify(view(who))}\n\n`);
    req.on("close", () => {
      listeners.delete(listener);
      if (!ids().has(who)) log(who, "leave", { here: here() });
    });
    return;
  }

  if (req.method === "GET" && path === "/api/state") return json(res, 200, view(who));

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
    if (!action) return json(res, 400, { error: "Unknown action." });
    const error = apply(who, action);
    if (error) {
      log(who, "refused", { action: kind, why: error });
      return json(res, 409, { error });
    }
    broadcast();
    return json(res, 200, { ok: true });
  }
  json(res, 404, { error: "Not found." });
}).listen(PORT, "0.0.0.0", () => console.log(`losscut on :${PORT}, seed ${seed}`));

start();
// Every page is pinged every 5s so dead connections are found and dropped.
setInterval(() => {
  for (const l of [...listeners]) {
    const ok = l.res.write(": ping\n\n");
    if (!ok && l.res.writableLength > 64_000) l.res.destroy();
  }
}, 5_000).unref();
