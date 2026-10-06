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
    y: 0.46 + Math.floor(i / 9) * 0.042,
    movedBy: null,
  }));
}

function load(): Magnet[] {
  if (!existsSync(FILE)) return seed();
  const saved = JSON.parse(readFileSync(FILE, "utf8")) as Magnet[];
  // The vocabulary is fixed in code: a saved magnet keeps its place, but its
  // text always comes from VOCABULARY.
  return seed().map((m) => {
    const s = saved.find((o) => o.id === m.id);
    return s ? { ...m, x: s.x, y: s.y, movedBy: s.movedBy } : m;
  });
}

function save(): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(`${FILE}.tmp`, JSON.stringify(magnets));
  renameSync(`${FILE}.tmp`, FILE);
}

const magnets = load();

const visitor = (req: IncomingMessage): string | null =>
  req.headers.cookie?.match(/(?:^|;\s*)v=([0-9a-f-]{36})/)?.[1] ?? null;

const view = (m: Magnet, who: string | null) => ({
  id: m.id,
  text: m.text,
  x: m.x,
  y: m.y,
  mine: who !== null && m.movedBy === who,
});

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
<link rel="stylesheet" href="/fridge.css">
</head>
<body class="readme"><main>${main}<p><a href="/">Back to the fridge</a></p></main></body>
</html>`;

const STATIC: Record<string, [string, string]> = {
  "/": ["public/index.html", "text/html; charset=utf-8"],
  "/fridge.js": ["public/fridge.js", "text/javascript; charset=utf-8"],
  "/fridge.css": ["public/fridge.css", "text/css; charset=utf-8"],
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  let who = visitor(req);
  if (!who) {
    who = randomUUID();
    res.setHeader("set-cookie", `v=${who}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`);
  }

  if (req.method === "GET" && STATIC[url.pathname]) {
    const [file, type] = STATIC[url.pathname];
    return send(res, 200, readFileSync(join(ROOT, file), "utf8"), type);
  }
  if (req.method === "GET" && (url.pathname === "/readme/" || url.pathname === "/readme")) {
    const md = readFileSync(join(ROOT, "README.md"), "utf8");
    return send(res, 200, page("About the fridge", renderMarkdown(md)), "text/html; charset=utf-8");
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
    const keys = input && typeof input === "object" ? Object.keys(input).sort().join(",") : "";
    const { x, y } = (input ?? {}) as { x: unknown; y: unknown };
    const inRange = (n: unknown): n is number => typeof n === "number" && n >= 0 && n <= 1;
    if (keys !== "x,y" || !inRange(x) || !inRange(y)) {
      return json(res, 400, { error: "send exactly {x, y}, each between 0 and 1" });
    }
    Object.assign(magnet, { x, y, movedBy: who });
    save();
    return json(res, 200, { magnet: view(magnet, who) });
  }

  json(res, 404, { error: "not found" });
});

server.listen(PORT, "0.0.0.0", () => console.log(`fridge on :${PORT}, data in ${FILE}`));
