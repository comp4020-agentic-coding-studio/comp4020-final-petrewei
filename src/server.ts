import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
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
const ROOT = join(import.meta.dirname, "..");

function seed(): Magnet[] {
  // Rows along the bottom half of the door, nine to a row, so no magnet
  // starts underneath another and the top half is clear for writing.
  return VOCABULARY.map((text, i) => ({
    id: `m${i}`,
    text,
    x: 0.01 + (i % 9) * 0.11,
    y: 0.46 + Math.floor(i / 9) * 0.044,
    movedBy: null,
  }));
}

function load(): Magnet[] {
  if (!existsSync(FILE)) return seed();
  const saved = JSON.parse(readFileSync(FILE, "utf8")) as Magnet[];
  // The vocabulary is fixed in code: a saved magnet keeps its place and its
  // stacking order (last moved is last, so on top), but its text always comes
  // from VOCABULARY. A word added to the vocabulary since starts at its seed.
  const fresh = new Map(seed().map((m) => [m.id, m]));
  const kept = saved.flatMap((s) => {
    const m = fresh.get(s.id);
    fresh.delete(s.id);
    return m ? [{ ...m, x: s.x, y: s.y, movedBy: s.movedBy }] : [];
  });
  return [...fresh.values(), ...kept];
}

function save(): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(`${FILE}.tmp`, JSON.stringify(magnets));
  renameSync(`${FILE}.tmp`, FILE);
}

const magnets = load();

const visitor = (req: IncomingMessage): string | null =>
  req.headers.cookie?.match(/(?:^|;\s*)v=([0-9a-f-]{36})/)?.[1] ?? null;

const view = ({ movedBy, ...m }: Magnet, who: string | null) => ({
  ...m,
  mine: who !== null && movedBy === who,
});

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
<link rel="icon" href="data:,">
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
  if (req.method === "GET" && url.pathname === "/api/magnets") {
    return json(res, 200, { magnets: magnets.map((m) => view(m, who)) });
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
    // Only a position can change. Anything else in the body, text especially,
    // is refused rather than ignored, so a client can't think it renamed a word.
    const { x, y } = (input ?? {}) as { x: unknown; y: unknown };
    if (Object.keys(input ?? {}).length !== 2 || !inRange(x) || !inRange(y)) {
      return json(res, 400, { error: "send exactly {x, y}, each between 0 and 1" });
    }
    // The magnet moved last goes to the end of the list, which every client
    // draws last, so it sits on top of anything it now overlaps.
    Object.assign(magnet, { x, y, movedBy: who });
    magnets.splice(magnets.indexOf(magnet), 1);
    magnets.push(magnet);
    save();
    return json(res, 200, { magnet: view(magnet, who), onTop: magnets.at(-1) === magnet });
  }

  json(res, 404, { error: "not found" });
});

server.listen(PORT, "0.0.0.0", () => console.log(`fridge on :${PORT}, data in ${FILE}`));
