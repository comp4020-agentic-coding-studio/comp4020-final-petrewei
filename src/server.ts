import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import { lines, text, width } from "./lines.ts";
import { renderMarkdown } from "./markdown.ts";
import { VOCABULARY } from "./words.ts";

// One fridge door. Positions are fractions of the door (0..1), so an
// arrangement survives any screen size. `movedBy` is the anonymous visitor
// cookie of whoever last moved the magnet; it never leaves the server, which
// only tells each visitor whether a magnet is theirs.
type Magnet = { id: string; text: string; x: number; y: number; movedBy: string | null };

const PORT = Number(process.env.PORT ?? 8080);
const DATA_DIR = process.env.DATA_DIR ?? "/data";
const FILE = join(DATA_DIR, "fridge.json");
const TAKEN_FILE = join(DATA_DIR, "taken.json");
const POEMS_FILE = join(DATA_DIR, "poems.json");
const ROOT = join(import.meta.dirname, "..");

// The starting heap: words packed left to right by their estimated width,
// rows of 0.044, ending at the bottom of the door, so no magnet starts under
// another and the space above is clear for writing. The gap allows for the
// width estimate running short by up to 0.66em (src/lines.ts).
const GAP = 0.016;
const ROW = 0.044;

function seed(): Magnet[] {
  let x = 0.01;
  let row = 0;
  const at = VOCABULARY.map((text) => {
    if (x + width(text) > 0.99) {
      x = 0.01;
      row++;
    }
    const spot = { x, row };
    x += width(text) + GAP;
    return spot;
  });
  const top = 0.985 - (row + 1) * ROW;
  return VOCABULARY.map((text, i) => ({
    id: `m${i}`,
    text,
    x: +at[i].x.toFixed(4),
    y: +(top + at[i].row * ROW).toFixed(4),
    movedBy: null,
  }));
}

function load(): Magnet[] {
  if (!existsSync(FILE)) return seed();
  const saved = JSON.parse(readFileSync(FILE, "utf8")) as Magnet[];
  // The vocabulary is fixed in code: a saved magnet keeps its place and its
  // stacking order (last moved is last, so on top), but its text always comes
  // from VOCABULARY. Words nobody has moved, and words added since, take
  // today's seed, so the heap always matches the current layout.
  const fresh = new Map(seed().map((m) => [m.id, m]));
  const kept = saved.flatMap((s) => {
    const m = fresh.get(s.id);
    fresh.delete(s.id);
    if (!m) return [];
    return s.movedBy === null ? [m] : [{ ...m, x: s.x, y: s.y, movedBy: s.movedBy }];
  });
  return [...fresh.values(), ...kept];
}

function save(): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(`${FILE}.tmp`, JSON.stringify(magnets));
  renameSync(`${FILE}.tmp`, FILE);
}

const magnets = load();

// Theft notices that are waiting for someone who wasn't on the page when their
// word was taken: visitor -> the words, newest last, at most 20 each. Only the
// word is kept, never who took it, for the 500 most recently robbed visitors.
const taken: Map<string, string[]> = new Map(
  existsSync(TAKEN_FILE) ? Object.entries(JSON.parse(readFileSync(TAKEN_FILE, "utf8"))) : [],
);

// ADR 0003, an archive of broken lines. A line has to stand this long to be
// kept when it breaks, so quick rearranging doesn't fill the archive.
const STAND_MS = 15_000;
type Poem = { text: string; at: string };
const poems: Poem[] = existsSync(POEMS_FILE) ? JSON.parse(readFileSync(POEMS_FILE, "utf8")) : [];

// Only words someone has moved can be poetry, so the heap of unused words
// along the bottom is never read as lines. This asks who moved a word, not
// where it sits: the saved door keeps words at older starting layouts, which
// a comparison with today's seed() misreads as moved.
const placed = (): Magnet[] => magnets.filter((m) => m.movedBy !== null);

// The lines on the door now, each keyed by its magnets in order, with when it
// first stood; a line extended into a longer one keeps its age.
let standing = new Map<string, { text: string; since: number }>();

function survey(): void {
  const now = Date.now();
  const current = new Map<string, { text: string; since: number }>();
  for (const line of lines(placed())) {
    const key = line.map((m) => m.id).join(",");
    let since = now;
    for (const [old, s] of standing) if (`,${key},`.includes(`,${old},`)) since = Math.min(since, s.since);
    current.set(key, { text: text(line), since });
  }
  let archived = false;
  for (const [old, s] of standing) {
    const grown = [...current.keys()].some((key) => `,${key},`.includes(`,${old},`));
    if (grown || now - s.since < STAND_MS) continue;
    const poem = { text: s.text, at: new Date(now).toISOString() };
    poems.push(poem);
    poems.splice(0, poems.length - 200);
    log(null, "poem", { text: s.text, stood: Math.round((now - s.since) / 1000) });
    emit({ type: "poem", ...poem });
    archived = true;
  }
  if (archived) savePoems();
  standing = current;
}

function savePoems(): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(`${POEMS_FILE}.tmp`, JSON.stringify(poems));
  renameSync(`${POEMS_FILE}.tmp`, POEMS_FILE);
}

function saveTaken(): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(`${TAKEN_FILE}.tmp`, JSON.stringify(Object.fromEntries(taken)));
  renameSync(`${TAKEN_FILE}.tmp`, TAKEN_FILE);
}

const visitor = (req: IncomingMessage): string | null =>
  req.headers.cookie?.match(/(?:^|;\s*)v=([0-9a-f-]{36})/)?.[1] ?? null;

// Crit 10: one structured line per thing a visitor does, to stdout (so
// `flyctl logs` tails it) and to the last 200 kept for /stats. A visitor is a
// short hash of their cookie: stable enough to follow one person through the
// log, and useless for taking over their session.
type Line = { t: string; who: string; ev: string } & Record<string, unknown>;
const recent: Line[] = [];
const short = (who: string): string => createHash("sha256").update(who).digest("hex").slice(0, 6);
const word = (id: string): string => magnets.find((m) => m.id === id)?.text ?? id;

function log(who: string | null, ev: string, fields: Record<string, unknown> = {}): void {
  const line: Line = { t: new Date().toISOString(), who: who ? short(who) : "server", ev, ...fields };
  console.log(JSON.stringify(line));
  recent.push(line);
  recent.splice(0, recent.length - 200);
}

// ADR 0002, one hand at a time: who is holding each word, and when that hold
// lapses if nothing renews it. Holds live in memory only; a restart frees them.
const HOLD_MS = 30_000;
const holds = new Map<string, { who: string; until: number }>();

function holder(id: string): string | null {
  const h = holds.get(id);
  if (h && h.until < Date.now()) holds.delete(id);
  return holds.get(id)?.who ?? null;
}

const view = ({ movedBy, ...m }: Magnet, who: string | null) => {
  const by = holder(m.id);
  return { ...m, mine: who !== null && movedBy === who, held: by !== null && by !== who };
};

// Open /api/events streams, each with its visitor, so a broadcast can tell
// each listener whether the magnet that moved is now theirs.
const listeners = new Set<{ res: ServerResponse; who: string }>();

function emit(data: unknown, to: (who: string) => boolean = () => true): void {
  for (const l of listeners) if (to(l.who)) l.res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcast(m: Magnet): void {
  for (const l of listeners) l.res.write(`data: ${JSON.stringify({ type: "move", ...view(m, l.who) })}\n\n`);
}

// Everyone but the holder is told a word is taken; everyone is told it's free.
function release(id: string): void {
  if (holds.delete(id)) emit({ type: "released", id });
}

// A lapsed hold is freed out loud, so pages stop showing it as taken.
setInterval(() => {
  for (const [id, h] of holds) {
    if (h.until >= Date.now()) continue;
    log(h.who, "lapse", { word: word(id) });
    release(id);
  }
}, 1_000).unref();

// Distinct visitors with the fridge open; every page is told when it changes.
const here = (): number => new Set([...listeners].map((l) => l.who)).size;
const presence = (): void => emit({ type: "presence", here: here() });

// Fly's proxy drops an idle connection after about a minute, so each stream
// gets a comment line well inside that.
setInterval(() => {
  for (const l of listeners) l.res.write(": keep-alive\n\n");
}, 25_000).unref();

const inRange = (n: unknown): n is number => typeof n === "number" && n >= 0 && n <= 1;

function send(res: ServerResponse, status: number, body: string, type: string): void {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}
const json = (res: ServerResponse, status: number, data: unknown): void =>
  send(res, status, JSON.stringify(data), "application/json");

async function body(req: IncomingMessage): Promise<string> {
  let s = "";
  for await (const chunk of req) {
    s += chunk;
    if (s.length > 1024) throw new Error("too large");
  }
  return s;
}

const page = (title: string, main: string): string => `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/fridge.css">
</head>
<body class="readme"><main>${main}<p><a href="/">Back to the fridge</a></p></main></body>
</html>`;

// Everything a GET can return besides the API is fixed in the image, so it's
// read (and README.md rendered) once at startup.
const HTML = "text/html; charset=utf-8";
const read = (file: string): string => readFileSync(join(ROOT, file), "utf8");
const readme = page("About the fridge", renderMarkdown(read("README.md")));
const PAGES: Record<string, [string, string]> = {
  "/": [read("public/index.html"), HTML],
  "/fridge.js": [read("public/fridge.js"), "text/javascript; charset=utf-8"],
  "/fridge.css": [read("public/fridge.css"), "text/css; charset=utf-8"],
  "/favicon.svg": [read("public/favicon.svg"), "image/svg+xml"],
  "/stats": [read("public/stats.html"), HTML],
  "/stats.js": [read("public/stats.js"), "text/javascript; charset=utf-8"],
  "/readme/": [readme, HTML],
  "/readme": [readme, HTML],
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  let who = visitor(req);
  if (!who) {
    who = randomUUID();
    res.setHeader("set-cookie", `v=${who}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`);
  }

  if (req.method === "GET" && PAGES[url.pathname]) {
    return send(res, 200, ...PAGES[url.pathname]);
  }
  if (req.method === "GET" && url.pathname === "/api/events") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive",
    });
    res.write(": open\n\n");
    const listener = { res, who };
    const already = [...listeners].some((l) => l.who === who);
    listeners.add(listener);
    if (!already) {
      log(who, "join", { here: here() });
      presence();
    }
    req.on("close", () => {
      listeners.delete(listener);
      // the holder's last open page is gone, so nobody is holding their words
      if ([...listeners].some((l) => l.who === listener.who)) return;
      for (const [id, h] of holds) {
        if (h.who !== listener.who) continue;
        log(listener.who, "drop", { word: word(id) });
        release(id);
      }
      log(listener.who, "leave", { here: here() });
      presence();
    });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/stats") {
    const holding = magnets.filter((m) => holder(m.id) !== null).length;
    return json(res, 200, { here: here(), holding, recent: recent.slice(-100).toReversed() });
  }
  if (req.method === "GET" && url.pathname === "/api/poems") {
    return json(res, 200, { poems: poems.toReversed(), standsFor: STAND_MS });
  }
  if (req.method === "GET" && url.pathname === "/api/taken") {
    return json(res, 200, { taken: taken.get(who) ?? [] });
  }
  if (req.method === "POST" && url.pathname === "/api/taken/seen") {
    const words = taken.get(who);
    if (words) {
      log(who, "seen", { words });
      taken.delete(who);
      saveTaken();
    }
    return json(res, 200, { taken: [] });
  }
  if (req.method === "GET" && url.pathname === "/api/magnets") {
    return json(res, 200, { magnets: magnets.map((m) => view(m, who)) });
  }

  const hand = url.pathname.match(/^\/api\/magnets\/(m\d+)\/(grab|release)$/);
  if (req.method === "POST" && hand) {
    const [, id, action] = hand;
    if (!magnets.some((m) => m.id === id)) return json(res, 404, { error: "no such magnet" });
    const by = holder(id);
    if (by !== null && by !== who) {
      log(who, "refused", { word: word(id), tried: action, holder: short(by) });
      return json(res, 409, { error: "someone else is holding that word" });
    }
    if (action === "release") {
      if (by === who) log(who, "release", { word: word(id) });
      release(id);
      return json(res, 200, { held: false });
    }
    // grabbing again renews the hold, which is how a long drag keeps it
    holds.set(id, { who, until: Date.now() + HOLD_MS });
    if (by === null) {
      log(who, "grab", { word: word(id) });
      emit({ type: "held", id }, (w) => w !== who);
    }
    return json(res, 200, { held: true });
  }

  const move = url.pathname.match(/^\/api\/magnets\/(m\d+)$/);
  if (req.method === "POST" && move) {
    const magnet = magnets.find((m) => m.id === move[1]);
    if (!magnet) return json(res, 404, { error: "no such magnet" });
    let input: unknown;
    try {
      input = JSON.parse(await body(req));
    } catch {
      return json(res, 400, { error: "send JSON {x, y}" });
    }
    const by = holder(magnet.id);
    if (by !== null && by !== who) {
      log(who, "refused", { word: magnet.text, tried: "move", holder: short(by) });
      return json(res, 409, { error: "someone else is holding that word" });
    }
    // Only a position can change. Anything else in the body, text especially,
    // is refused rather than ignored, so a client can't think it renamed a word.
    const { x, y } = (input ?? {}) as { x: unknown; y: unknown };
    if (Object.keys(input ?? {}).length !== 2 || !inRange(x) || !inRange(y)) {
      log(who, "rejected", { word: magnet.text });
      return json(res, 400, { error: "send exactly {x, y}, each between 0 and 1" });
    }
    // The magnet moved last goes to the end of the list, which every client
    // draws last, so it sits on top of anything it now overlaps.
    const from = magnet.movedBy;
    Object.assign(magnet, { x, y, movedBy: who });
    magnets.splice(magnets.indexOf(magnet), 1);
    magnets.push(magnet);
    save();
    holds.delete(magnet.id);
    const took = from !== null && from !== who ? { from: short(from) } : {};
    log(who, "move", { word: magnet.text, x: +x.toFixed(3), y: +y.toFixed(3), ...took });
    broadcast(magnet);
    survey();
    // Someone else's word was taken: tell them now if they're on the page, or
    // keep it for when they come back.
    if (from !== null && from !== who) {
      const notice = { type: "taken", id: magnet.id, text: magnet.text };
      if ([...listeners].some((l) => l.who === from)) emit(notice, (w) => w === from);
      else {
        const words = [...(taken.get(from) ?? []), magnet.text].slice(-20);
        taken.delete(from);
        taken.set(from, words);
        // Most visitors never come back, so only the 500 most recently robbed
        // are kept (a Map iterates oldest first).
        while (taken.size > 500) taken.delete(taken.keys().next().value!);
        saveTaken();
      }
    }
    return json(res, 200, { magnet: view(magnet, who), onTop: magnets.at(-1) === magnet });
  }

  json(res, 404, { error: "not found" });
});

survey();
server.listen(PORT, "0.0.0.0", () => console.log(`fridge on :${PORT}, data in ${FILE}`));
