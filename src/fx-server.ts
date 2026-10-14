// FX Fighter's server: one shared market, traded live by everyone with the
// page open, plus four house bots. The server owns the price, fills every
// order at the price when it arrives, and enforces margin calls and
// stop-outs; pages only show what it sends. A round is three minutes: a
// hidden replay of real history, or (every third round) a live round from
// today's rate. Career results are kept on the volume.
import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import { BOTS } from "./bots.ts";
import { BORROW, Desk, LEVERAGES, LOANS, START, type Event, type Side } from "./fx.ts";
import { renderMarkdown } from "./markdown.ts";
import { DAYS, History, PAIRS, STEPS, live, random, replay, type Pair, type Round } from "./market.ts";

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

// A visitor is their cookie; others see them by a trader name drawn from it.
const ADJ = ["Lucky", "Panic", "Diamond", "Paper", "Moon", "Margin", "Lonely", "Golden", "Sleepy", "Brave", "Greedy", "Humble"];
const NOUN = ["Yen", "Pip", "Bull", "Bear", "Whale", "Candle", "Franc", "Kiwi", "Aussie", "Loonie", "Swap", "Lot"];
const hash = (who: string): Buffer => createHash("sha256").update(who).digest();
const bot = (who: string) => BOTS.find((b) => b.id === who);
const nameOf = (who: string): string => bot(who)?.name ?? `${ADJ[hash(who)[0] % ADJ.length]} ${NOUN[hash(who)[1] % NOUN.length]}`;
const short = (who: string): string => (bot(who) ? who : hash(who).toString("hex").slice(0, 6));

function log(who: string | null, ev: string, fields: Record<string, unknown> = {}): void {
  const text = JSON.stringify({ t: new Date().toISOString(), who: who ? short(who) : "server", ev, ...fields });
  console.log(text);
  try {
    appendFileSync(ACTIVITY, `${text}\n`);
  } catch (error) {
    console.error("could not append to the activity log:", error);
  }
}

// Career results across rounds and restarts: the long-term ranking.
type Career = { name: string; rounds: number; profit: number; wins: number; busts: number; best: number };
const career: Record<string, Career> = existsSync(CAREER_FILE) ? JSON.parse(readFileSync(CAREER_FILE, "utf8")) : {};
function saveCareer(): void {
  writeFileSync(`${CAREER_FILE}.tmp`, JSON.stringify(career));
  renameSync(`${CAREER_FILE}.tmp`, CAREER_FILE);
}

// The round being played, or the break after it.
let seed = Date.now() % 2 ** 31;
const rnd = random(seed);
let count = 0;
let round: Round;
let desk: Desk;
let tick = 0;
let phase: "trade" | "break" = "trade";
let breakLeft = 0;
let result: { ranking: { id: string; name: string; balance: number; you?: boolean }[]; reveal: string } | null = null;
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
let liveFrom = "";

function start(): void {
  count++;
  if (count % 3 === 0) {
    const pair = PAIRS[Math.floor(rnd() * PAIRS.length)];
    const now = todayRate(pair);
    round = live(history, pair, now.rate, rnd);
    liveFrom = `${now.date} (${now.source})`;
  } else {
    round = replay(history, rnd, 0.6);
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

const yen = (n: number): string => `${n < 0 ? "−" : ""}¥${Math.abs(Math.round(n)).toLocaleString("en-AU")}`;

// Turn the desk's events into the room's feed. A stop-out is everyone's
// business; that is the point of trading in the same room.
function report(events: Event[]): void {
  for (const e of events) {
    const name = nameOf(e.who);
    if (e.kind === "open") say(`${name} ${e.side === 1 ? "bought" : "sold"} at ${e.leverage}×`, e.leverage! >= 400 ? "wild" : "trade");
    else if (e.kind === "add") say(`${name} doubled down. Now ${e.leverage}×`, "wild");
    else if (e.kind === "close") say(`${name} closed: ${yen(e.pnl)}`, e.pnl >= 0 ? "win" : "loss");
    else if (e.kind === "stop") say(`${name}'s stop filled at ${fmt(e.price)}: ${yen(e.pnl)}`, "loss");
    else if (e.kind === "call") say(`MARGIN CALL for ${name}!`, "call");
    else if (e.kind === "stopout") say(`強制ロスカット! ${name} was stopped out: ${yen(e.pnl)}`, "bust");
    else if (e.kind === "zerocut") say(`${name} was wiped out and leaves the market.`, "bust");
    if (e.kind === "stopout" || e.kind === "zerocut") {
      if (!bot(e.who)) record(e.who).busts++;
    }
    if (e.kind !== "call") log(e.who, e.kind, { price: e.price, pnl: Math.round(e.pnl), leverage: e.leverage });
  }
}

const digits = (): number => (round.pair.endsWith("JPY") ? 3 : 5);
const fmt = (p: number): string => p.toFixed(digits());

function record(who: string): Career {
  career[short(who)] ??= { name: nameOf(who), rounds: 0, profit: 0, wins: 0, busts: 0, best: 0 };
  return career[short(who)];
}

function end(): void {
  const ranking = desk.settle();
  const humans = ranking.filter((r) => !bot(r.who));
  ranking.forEach((r, i) => {
    if (bot(r.who)) return;
    const c = record(r.who);
    c.rounds++;
    c.profit += r.net - START;
    c.best = Math.max(c.best, r.net - START);
    if (i === ranking.findIndex((x) => !bot(x.who)) && humans.length > 1) c.wins++;
  });
  if (humans.length) saveCareer();
  const reveal = round.simulated
    ? `That was a simulation from ${round.pair} on ${liveFrom}.`
    : `That was ${round.pair} from ${round.days[0]} to ${round.days.at(-1)}.${round.event ? ` ${round.event.title} (${round.event.date}): ${round.event.note}` : ""}`;
  result = { ranking: ranking.map((r) => ({ id: short(r.who), name: nameOf(r.who), balance: r.net })), reveal };
  log(null, "end", { ranking: ranking.map((r) => [short(r.who), r.net]) });
  phase = "break";
  breakLeft = BREAK_TICKS;
}

// The clock. Each tick moves the price, lets the bots act, enforces the
// rules and sends the new state to everyone.
setInterval(() => {
  if (phase === "break") {
    if (--breakLeft <= 0) start();
    broadcast(true);
    return;
  }
  tick++;
  report(desk.mark(round.prices[tick]));
  const seen = round.prices.slice(0, tick + 1);
  for (const b of BOTS) {
    const action = b.act(desk, b.id, seen, rnd);
    if (action) apply(b.id, action);
  }
  if (tick >= round.prices.length - 1) end();
  broadcast();
}, TICK_MS).unref();

type Action = { kind: "order"; side: Side; leverage: number; stake?: number } | { kind: "close" } | { kind: "stop"; at: number | null } | { kind: "pray" } | { kind: "borrow" };
function apply(who: string, action: Action): string | null {
  if (phase !== "trade") return "The market is closed. Next round soon.";
  desk.join(who);
  if (action.kind === "pray") {
    prays.set(who, (prays.get(who) ?? 0) + 1);
    if (prays.get(who) === 1 || prays.get(who)! % 10 === 0) say(`${nameOf(who)} is praying to the chart (×${prays.get(who)}). It does nothing.`, "pray");
    return null;
  }
  if (action.kind === "stop") return desk.stop(who, action.at);
  if (action.kind === "borrow") {
    const refused = desk.borrow(who);
    if (refused) return refused;
    const first = desk.account(who).debt === BORROW;
    say(first ? `${nameOf(who)} borrowed ${yen(BORROW)} from Dad's savings. "Just until the market turns."` : `${nameOf(who)} borrowed from Dad again. That was the last of it.`, "wild");
    log(who, "borrow", { debt: desk.account(who).debt });
    return null;
  }
  if (action.kind === "close") {
    const pos = desk.account(who).pos;
    if (!pos) return "Nothing to close.";
    action = { kind: "order", side: -pos.side as Side, leverage: pos.leverage };
  }
  const out = desk.order(who, action.side, action.leverage, action.stake);
  if (typeof out === "string") return out;
  report(out);
  return null;
}

const listeners = new Set<{ res: ServerResponse; who: string }>();

// What one visitor sees: the shared chart, everyone's standing, and their
// own account in full. Other people's positions show side and leverage
// but not their stops, which would be a gift to the room.
// Pages are sent the whole price history when they join or a round
// changes phase, and otherwise only the newest price, from `from` on.
function view(who: string, from = 0) {
  const traders = desk.players().map((p) => {
    const a = desk.account(p);
    return { id: short(p), name: nameOf(p), bot: !!bot(p), equity: Math.round(desk.equity(p) - a.debt), side: a.pos?.side ?? 0, leverage: a.pos?.leverage ?? 0, out: a.out, you: p === who };
  });
  traders.sort((a, b) => b.equity - a.equity);
  const mine = desk.players().includes(who) ? desk.account(who) : null;
  return {
    phase,
    round: count,
    pair: round.pair,
    digits: digits(),
    simulated: round.simulated,
    tick,
    total: DAYS * STEPS,
    day: Math.floor(tick / STEPS),
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
      pos: mine?.pos ? { side: mine.pos.side, entry: mine.pos.entry, leverage: mine.pos.leverage, margin: mine.pos.margin, stop: mine.pos.stop } : null,
    },
    traders,
    feed,
    result: result && { ...result, ranking: result.ranking.map((r) => ({ ...r, you: r.id === short(who) })) },
    career: Object.entries(career)
      .map(([id, c]) => ({ ...c, you: id === short(who) }))
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 10),
    leverages: LEVERAGES,
  };
}

function broadcast(full = false): void {
  for (const l of listeners) l.res.write(`data: ${JSON.stringify(view(l.who, full ? 0 : tick))}\n\n`);
}

const json = (res: ServerResponse, status: number, data: unknown): void => {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(data));
};

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  let s = "";
  for await (const chunk of req) {
    s += chunk;
    if (s.length > 1024) throw new Error("too large");
  }
  return JSON.parse(s || "{}") as Record<string, unknown>;
}

const HTML = "text/html; charset=utf-8";
const readme = `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>About FX Fighter</title><link rel="stylesheet" href="/fx.css"></head><body class="readme"><main>${renderMarkdown(read("README.md"))}<p><a href="/">Back to the market</a></p></main></body></html>`;
const PAGES: Record<string, [string, string]> = {
  "/": [read("public/fx.html"), HTML],
  "/fx.js": [read("public/fx.js"), "text/javascript; charset=utf-8"],
  "/fx.css": [read("public/fx.css"), "text/css; charset=utf-8"],
  "/readme/": [readme, HTML],
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  let who = req.headers.cookie?.match(/(?:^|;\s*)v=([0-9a-f-]{36})/)?.[1] ?? null;
  if (!who) {
    who = randomUUID();
    res.setHeader("set-cookie", `v=${who}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`);
  }

  if (req.method === "GET" && PAGES[url.pathname]) {
    res.writeHead(200, { "content-type": PAGES[url.pathname][1], "cache-control": "no-store" });
    return res.end(PAGES[url.pathname][0]);
  }

  // Opening the page joins the round in progress with a fresh account.
  if (req.method === "GET" && url.pathname === "/api/events") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
    const listener = { res, who };
    listeners.add(listener);
    if (phase === "trade" && !desk.players().includes(who)) {
      desk.join(who);
      say(`${nameOf(who)} entered the market.`, "info");
      log(who, "join", { name: nameOf(who) });
    }
    res.write(`data: ${JSON.stringify(view(who))}\n\n`);
    req.on("close", () => listeners.delete(listener));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/state") return json(res, 200, view(who));

  if (req.method === "POST" && url.pathname === "/api/act") {
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
    else if (kind === "stop") action = { kind: "stop", at: typeof input.at === "number" ? input.at : null };
    if (!action) return json(res, 400, { error: "Unknown action." });
    const error = apply(who, action);
    broadcast();
    return json(res, error ? 409 : 200, error ? { error } : { ok: true });
  }
  json(res, 404, { error: "Not found." });
}).listen(PORT, "0.0.0.0", () => console.log(`fx fighter on :${PORT}, seed ${seed}`));

start();
// Every page is pinged every 5s so dead connections are found and dropped.
setInterval(() => {
  for (const l of [...listeners]) {
    const ok = l.res.write(": ping\n\n");
    if (!ok && l.res.writableLength > 64_000) l.res.destroy();
  }
}, 5_000).unref();
