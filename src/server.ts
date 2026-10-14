import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import { Holds } from "./holds.ts";
import { lines, text, width } from "./lines.ts";
import { renderMarkdown } from "./markdown.ts";
import { VOCABULARY } from "./words.ts";

// One fridge door. Positions are fractions of the door (0..1), so an
// arrangement survives any screen size. `movedBy` is the anonymous visitor
// cookie of whoever last moved the magnet; it never leaves the server, which
// only tells each visitor whether a magnet is theirs.
type Magnet = { id: string; text: string; x: number; y: number; movedBy: string | null; v: number };

const PORT = Number(process.env.PORT ?? 8080);
const DATA_DIR = process.env.DATA_DIR ?? "/data";
const FILE = join(DATA_DIR, "fridge.json");
const TAKEN_FILE = join(DATA_DIR, "taken.json");
const POEMS_FILE = join(DATA_DIR, "poems.json");
const JOURNAL = join(DATA_DIR, "moves.log");
const ACTIVITY = join(DATA_DIR, "activity.log");
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
    v: 0,
  }));
}

const readJson = <T>(file: string, fallback: T): T =>
  existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : fallback;

// Writes are batched: a busy room moves several words a second, and each
// write is a whole file. Whatever changed is written at most every half
// second, through a temporary file and a rename so a crash can't leave half
// a file, and once more when the machine stops.
const pending = new Map<string, () => unknown>();
let flushing: NodeJS.Timeout | null = null;

// A failed write is logged and kept for the next flush rather than thrown
// from a timer, which would take the whole server down.
function flush(): void {
  if (flushing) clearTimeout(flushing);
  flushing = null;
  for (const [file, data] of pending) {
    try {
      writeFileSync(`${file}.tmp`, JSON.stringify(data()));
      renameSync(`${file}.tmp`, file);
      pending.delete(file);
      // the door is on disk in full, so the moves journalled since are in it
      if (file === FILE) writeFileSync(JOURNAL, "");
    } catch (error) {
      console.error(`could not write ${file}:`, error);
    }
  }
  if (pending.size) flushing = setTimeout(flush, 500);
}

function persist(file: string, data: () => unknown): void {
  pending.set(file, data);
  flushing ??= setTimeout(flush, 500);
}

// Pending writes go to disk on any exit Node can see: a stop signal, or a
// crash on an uncaught exception. Only SIGKILL or the kernel's out-of-memory
// killer can lose the last half second (ADR 0005).
process.on("exit", flush);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(0));

mkdirSync(DATA_DIR, { recursive: true });

function load(): Magnet[] {
  const saved = readJson<Magnet[] | null>(FILE, null);
  if (!saved) return seed();
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

const magnets = load();

// ADR 0006: each move is also appended to a journal the moment it is made,
// before the visitor is told it worked. An append reaches the operating
// system at once, so killing the process can't lose it; the batched write of
// the whole door then empties the journal. At startup, moves journalled after
// the last full write are replayed in order.
type Entry = { id: string; x: number; y: number; movedBy: string };
function replay(): void {
  if (!existsSync(JOURNAL)) return;
  for (const line of readFileSync(JOURNAL, "utf8").split("\n")) {
    if (!line) continue;
    let e: Entry;
    try {
      e = JSON.parse(line) as Entry;
    } catch {
      continue; // a line cut short by the kill: its move was never confirmed
    }
    const m = magnets.find((n) => n.id === e.id);
    if (!m) continue;
    Object.assign(m, { x: e.x, y: e.y, movedBy: e.movedBy });
    magnets.splice(magnets.indexOf(m), 1);
    magnets.push(m);
  }
}
replay();

const save = (m: Magnet): void => {
  appendFileSync(JOURNAL, `${JSON.stringify({ id: m.id, x: m.x, y: m.y, movedBy: m.movedBy })}\n`);
  persist(FILE, () => magnets.map(({ v, ...n }) => n));
};

// Every change to a word (a move, a hold, a release) stamps it with a new
// version, carried by every event and reply, so a page applies news about a
// word only if it is newer than what it already has. Versions start from the
// clock, so they keep rising across a restart.
let version = Date.now();
for (const m of magnets) m.v = version;
const stamp = (id: string): number => (magnets.find((m) => m.id === id)!.v = ++version);

// Theft notices that are waiting for someone who wasn't on the page when their
// word was taken: visitor -> the words, newest last, at most 20 each. Only the
// word is kept, never who took it, for the 500 most recently robbed visitors.
const taken = new Map<string, string[]>(Object.entries(readJson(TAKEN_FILE, {})));
const saveTaken = (): void => persist(TAKEN_FILE, () => Object.fromEntries(taken));

// ADR 0003, an archive of broken lines. A line has to stand this long to be
// kept when it breaks, so quick rearranging doesn't fill the archive.
const STAND_MS = 15_000;
type Poem = { text: string; at: string };
const poems = readJson<Poem[]>(POEMS_FILE, []);

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
  if (archived) persist(POEMS_FILE, () => poems);
  standing = current;
}

const visitor = (req: IncomingMessage): string | null =>
  req.headers.cookie?.match(/(?:^|;\s*)v=([0-9a-f-]{36})/)?.[1] ?? null;

// Crit 10: one structured line per thing a visitor does. It goes to stdout,
// so `flyctl logs` tails it, and is appended to /data/activity.log, so the
// record outlives restarts and the crit itself: Fly's own buffer keeps only
// about a hundred lines, and memory is wiped by every restart. /stats reads
// its last 200 back at startup. A visitor is a short hash of their cookie:
// stable enough to follow one person through the log, and useless for
// taking over their session.
type Line = { t: string; who: string; ev: string } & Record<string, unknown>;

// When the log passes this size, the older half is dropped, so it can't fill
// the volume; about 20,000 lines, weeks of a busy room.
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
const saved = readActivity();
const recent: Line[] = saved.slice(-200);

// How often each word has been moved, over the whole saved log: evidence for
// the README's judged claim about the vocabulary. Counted once at startup,
// then kept up to date as words move.
const moves = new Map<string, number>();
const count = (l: Line): void => {
  if (l.ev === "move" && typeof l.word === "string") moves.set(l.word, (moves.get(l.word) ?? 0) + 1);
};
saved.forEach(count);
const short = (who: string): string => createHash("sha256").update(who).digest("hex").slice(0, 6);
const word = (id: string): string => magnets.find((m) => m.id === id)?.text ?? id;

function log(who: string | null, ev: string, fields: Record<string, unknown> = {}): void {
  const line: Line = { t: new Date().toISOString(), who: who ? short(who) : "server", ev, ...fields };
  const text = JSON.stringify(line);
  console.log(text);
  try {
    appendFileSync(ACTIVITY, `${text}\n`);
  } catch (error) {
    console.error("could not append to the activity log:", error);
  }
  count(line);
  recent.push(line);
  recent.splice(0, recent.length - 200);
}

// ADR 0002, one hand at a time (src/holds.ts). Every end of a hold is logged
// under its reason and announced, so pages stop showing the word as taken.
const holds = new Holds({
  ms: 30_000,
  ended: (id, who, why) => {
    log(who, why, { word: word(id) });
    emit({ type: "released", id, v: stamp(id) });
  },
});
const holder = (id: string): string | null => holds.holder(id);

const view = ({ movedBy, ...m }: Magnet, who: string | null) => {
  const by = holder(m.id);
  return { ...m, mine: who !== null && movedBy === who, held: by !== null && by !== who };
};

// Open /api/events streams, each with its visitor, so a broadcast can tell
// each listener whether the magnet that moved is now theirs.
const listeners = new Set<{ res: ServerResponse; who: string }>();
const isHere = (who: string): boolean => [...listeners].some((l) => l.who === who);

function emit(data: unknown, to: (who: string) => boolean = () => true): void {
  for (const l of listeners) if (to(l.who)) l.res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcast(m: Magnet): void {
  for (const l of listeners) l.res.write(`data: ${JSON.stringify({ type: "move", ...view(m, l.who) })}\n\n`);
}

// Lapsed holds are swept every second, and for one word just before anyone
// acts on it, so a lapse is always reported first.
setInterval(() => holds.sweep(), 1_000).unref();

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
  "/readme/": [readme, HTML],
  "/readme": [readme, HTML],
};

// ADR 0007: the activity log names visitors by short code, so who took whose
// word, and the README promises a visitor is never told by whom. Only the
// holder of STATS_KEY (a Fly secret, never in the repo) may read it; anyone
// else gets the same 404 as a path that doesn't exist. With no key set, the
// log is shut to everyone.
const STATS_KEY = process.env.STATS_KEY ?? "";
const LOG_PAGES: Record<string, [string, string]> = {
  "/stats": [read("public/stats.html"), HTML],
  "/stats.js": [read("public/stats.js"), "text/javascript; charset=utf-8"],
};

function operator(url: URL): boolean {
  const given = Buffer.from(url.searchParams.get("key") ?? "");
  const key = Buffer.from(STATS_KEY);
  return key.length > 0 && given.length === key.length && timingSafeEqual(given, key);
}

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
  if (req.method === "GET" && (LOG_PAGES[url.pathname] || url.pathname === "/api/stats") && !operator(url)) {
    return json(res, 404, { error: "not found" });
  }
  if (req.method === "GET" && LOG_PAGES[url.pathname]) {
    return send(res, 200, ...LOG_PAGES[url.pathname]);
  }
  if (req.method === "GET" && url.pathname === "/api/events") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive",
    });
    res.write(": open\n\n");
    const listener = { res, who };
    const already = isHere(who);
    listeners.add(listener);
    if (!already) {
      log(who, "join", { here: here() });
      presence();
    }
    req.on("close", () => {
      listeners.delete(listener);
      // the holder's last open page is gone, so nobody is holding their words
      if (isHere(listener.who)) return;
      holds.drop(listener.who);
      log(listener.who, "leave", { here: here() });
      presence();
    });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/stats") {
    const used = [...moves].sort((a, b) => b[1] - a[1]);
    const unused = VOCABULARY.filter((w) => !moves.has(w));
    return json(res, 200, { here: here(), holding: holds.size, recent: recent.slice(-100).toReversed(), words: { used, unused } });
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

  // Someone else holds this word: log the reach, and answer 409 with the word
  // as it stands, so the page can correct itself without another request.
  const refused = (id: string, tried: string): boolean => {
    const by = holder(id);
    if (by === null || by === who) return false;
    log(who, "refused", { word: word(id), tried, holder: short(by) });
    json(res, 409, { error: "someone else is holding that word", magnet: view(magnets.find((m) => m.id === id)!, who) });
    return true;
  };

  const hand = url.pathname.match(/^\/api\/magnets\/(m\d+)\/(grab|release)$/);
  if (req.method === "POST" && hand) {
    const [, id, action] = hand;
    if (!magnets.some((m) => m.id === id)) return json(res, 404, { error: "no such magnet" });
    holds.sweep(id);
    if (refused(id, action)) return;
    const v = () => magnets.find((m) => m.id === id)!.v;
    if (action === "release") {
      holds.release(id, who);
      return json(res, 200, { held: false, v: v() });
    }
    if (holds.grab(id, who) === "new") {
      log(who, "grab", { word: word(id) });
      emit({ type: "held", id, v: stamp(id) }, (w) => w !== who);
    }
    return json(res, 200, { held: true, v: v() });
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
    holds.sweep(magnet.id);
    if (refused(magnet.id, "move")) return;
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
    const thief = from !== null && from !== who;
    Object.assign(magnet, { x, y, movedBy: who, v: ++version });
    magnets.splice(magnets.indexOf(magnet), 1);
    magnets.push(magnet);
    save(magnet);
    holds.moved(magnet.id);
    log(who, "move", { word: magnet.text, x: +x.toFixed(3), y: +y.toFixed(3), ...(thief ? { from: short(from) } : {}) });
    broadcast(magnet);
    survey();
    // Someone else's word was taken: tell them now if they're on the page, or
    // keep it for when they come back.
    if (thief) {
      const notice = { type: "taken", id: magnet.id, text: magnet.text };
      if (isHere(from)) emit(notice, (w) => w === from);
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
