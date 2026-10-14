// Fridge Rush's server (ADR 0009): one shared door of letter magnets, played
// live by everyone with the page open. The rules live in src/rush.ts; this
// file joins visitors to the game, applies their actions, and streams the
// whole game to every page after each change. The best words ever played are
// kept on the volume; everything else lasts a round.
import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import { renderMarkdown } from "./markdown.ts";
import { Rush, TRAY } from "./rush.ts";

const PORT = Number(process.env.PORT ?? 8080);
const DATA_DIR = process.env.DATA_DIR ?? "/data";
const ROOT = join(import.meta.dirname, "..");
const BEST_FILE = join(DATA_DIR, "best.json");
const ACTIVITY = join(DATA_DIR, "activity.log");
mkdirSync(DATA_DIR, { recursive: true });

const read = (file: string): string => readFileSync(join(ROOT, file), "utf8");
const words = new Set(read("src/dictionary.txt").split("\n").filter(Boolean));
const rush = new Rush({ roundMs: 120_000, breakMs: 12_000, stealMs: 4_000, words });

// A visitor is their cookie; others see them only by a fridge-themed name
// drawn from it, so nobody types a name and nothing needs moderating.
const ADJ = ["Cold", "Frozen", "Fizzy", "Crisp", "Leftover", "Melted", "Sticky", "Chilled", "Fresh", "Soggy", "Spicy", "Sour"];
const NOUN = ["Toast", "Kettle", "Pickle", "Butter", "Lemon", "Jelly", "Noodle", "Muffin", "Yoghurt", "Waffle", "Olive", "Custard"];
const hash = (who: string): Buffer => createHash("sha256").update(who).digest();
const nameOf = (who: string): string => `${ADJ[hash(who)[0] % ADJ.length]} ${NOUN[hash(who)[1] % NOUN.length]}`;
const hueOf = (who: string): number => (hash(who)[2] * 360) / 256;
const short = (who: string): string => hash(who).toString("hex").slice(0, 6);

// One JSON line per action, to stdout and the volume, as in the fridge.
function log(who: string | null, ev: string, fields: Record<string, unknown> = {}): void {
  const text = JSON.stringify({ t: new Date().toISOString(), who: who ? short(who) : "server", ev, ...fields });
  console.log(text);
  try {
    appendFileSync(ACTIVITY, `${text}\n`);
  } catch (error) {
    console.error("could not append to the activity log:", error);
  }
}

// The best words ever played, across rounds and restarts.
type Best = { name: string; word: string; points: number; at: string };
const best: Best[] = existsSync(BEST_FILE) ? JSON.parse(readFileSync(BEST_FILE, "utf8")) : [];
function remember(entry: Best): void {
  best.push(entry);
  best.sort((a, b) => b.points - a.points);
  best.splice(10);
  writeFileSync(`${BEST_FILE}.tmp`, JSON.stringify(best));
  renameSync(`${BEST_FILE}.tmp`, BEST_FILE);
}

// The live feed of plays and steals, newest first, shown to everyone.
type Feed = { text: string; at: number };
const feed: Feed[] = [];
const announce = (text: string): void => {
  feed.unshift({ text, at: Date.now() });
  feed.splice(12);
};

const listeners = new Set<{ res: ServerResponse; who: string }>();
const here = (who: string): boolean => [...listeners].some((l) => l.who === who);

// When each player's page last checked in (every 5s, and with every action).
// A page that stops, because its browser crashed or its laptop shut, may
// never close its connection, so silence of 15s counts as leaving.
const seen = new Map<string, number>();
function leave(who: string, why: string): void {
  for (const l of [...listeners]) if (l.who === who) l.res.destroy();
  if (!rush.players().includes(who)) return;
  rush.leave(who);
  seen.delete(who);
  log(who, "leave", { why });
  announce(`${nameOf(who)} left.`);
  broadcast();
}
setInterval(() => {
  for (const who of rush.players()) if (Date.now() - (seen.get(who) ?? 0) > 15_000) leave(who, "silent");
}, 2_000).unref();

// The whole game as one visitor sees it: their own tray in full, everyone
// else's as letters with names and colours, so a steal is a visible choice.
function view(who: string) {
  const { phase, endsAt, players } = rush.state();
  return {
    type: "game",
    phase,
    endsAt,
    players,
    you: { name: nameOf(who), hue: hueOf(who), tray: rush.tray(who), stealAt: rush.stealReadyAt(who) },
    door: rush.door(),
    rivals: rush
      .players()
      .filter((p) => p !== who)
      .map((p) => ({ id: short(p), name: nameOf(p), hue: hueOf(p), tray: rush.tray(p), score: Math.round(rush.scores.get(p) ?? 0) })),
    board: rush
      .players()
      .map((p) => ({ name: nameOf(p), hue: hueOf(p), score: rush.scores.get(p) ?? 0, you: p === who }))
      .sort((a, b) => b.score - a.score),
    feed,
    best,
  };
}

function broadcast(): void {
  for (const l of listeners) l.res.write(`data: ${JSON.stringify(view(l.who))}\n\n`);
}

// Rounds end and start on the clock. Pages count down from `endsAt`
// themselves, so the game is only sent again when the phase changes.
setInterval(() => {
  const before = rush.state().phase;
  const ended = rush.tick();
  if (ended) {
    const top = ended.ranking[0];
    announce(top ? `Round over. ${nameOf(top[0])} wins with ${Math.round(top[1])}!` : "Round over.");
    log(null, "round", { ranking: ended.ranking.map(([w, n]) => [short(w), n]) });
  }
  if (rush.state().phase !== before) broadcast();
}, 250).unref();
// Every page is pinged every 5s. A write to a connection that has gone away
// fails; one whose browser vanished without closing it (a crash, a laptop
// shut) stops draining and its buffer grows. Either way the player is
// dropped, so nobody sits in the game holding letters.
setInterval(() => {
  for (const l of [...listeners]) {
    const ok = l.res.write(": ping\n\n");
    if (!ok && l.res.writableLength > 64_000) l.res.destroy();
  }
}, 5_000).unref();

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
const readme = `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>About Fridge Rush</title><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/rush.css"></head><body class="readme"><main>${renderMarkdown(read("README.md"))}<p><a href="/">Back to the fridge</a></p></main></body></html>`;
const PAGES: Record<string, [string, string]> = {
  "/": [read("public/rush.html"), HTML],
  "/rush.js": [read("public/rush.js"), "text/javascript; charset=utf-8"],
  "/rush.css": [read("public/rush.css"), "text/css; charset=utf-8"],
  "/favicon.svg": [read("public/favicon.svg"), "image/svg+xml"],
  "/readme/": [readme, HTML],
  "/readme": [readme, HTML],
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

  // Opening the page joins the game; closing the last tab leaves it, and the
  // player's letters go back on the door.
  if (req.method === "GET" && url.pathname === "/api/events") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
    res.write(": open\n\n");
    const listener = { res, who };
    const joining = !rush.players().includes(who);
    listeners.add(listener);
    seen.set(who, Date.now());
    if (joining) {
      rush.join(who);
      log(who, "join", { name: nameOf(who) });
      announce(`${nameOf(who)} opened the fridge.`);
    }
    broadcast();
    req.on("close", () => {
      listeners.delete(listener);
      if (!here(listener.who)) leave(listener.who, "closed");
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/game") return json(res, 200, view(who));
  if (req.method === "POST" && url.pathname === "/api/alive") {
    if (rush.players().includes(who)) seen.set(who, Date.now());
    return json(res, 200, { ok: true });
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/")) {
    let input: Record<string, unknown>;
    try {
      input = await body(req);
    } catch {
      return json(res, 400, { error: "send JSON" });
    }
    const id = typeof input.id === "string" ? input.id : "";
    if (rush.players().includes(who)) seen.set(who, Date.now());
    switch (url.pathname) {
      case "/api/snatch": {
        const ok = rush.snatch(who, id);
        if (ok) log(who, "snatch", { ch: rush.tray(who).at(-1)?.ch });
        broadcast();
        return json(res, ok ? 200 : 409, { ok, why: ok ? undefined : rush.tray(who).length >= TRAY ? "your tray is full" : "too late" });
      }
      case "/api/drop": {
        const ok = rush.drop(who, id);
        broadcast();
        return json(res, ok ? 200 : 409, { ok });
      }
      case "/api/steal": {
        const victim = rush.players().find((p) => short(p) === input.from);
        const ch = victim ? rush.tray(victim).find((t) => t.id === id)?.ch : undefined;
        const ok = victim !== undefined && rush.steal(who, victim, id);
        if (ok && victim) {
          log(who, "steal", { ch, from: short(victim) });
          announce(`${nameOf(who)} stole ${ch?.toUpperCase()} from ${nameOf(victim)}!`);
        }
        broadcast();
        return json(res, ok ? 200 : 409, { ok, why: ok ? undefined : "you can't steal yet" });
      }
      case "/api/play": {
        const word = typeof input.word === "string" ? input.word.slice(0, TRAY) : "";
        const result = rush.play(who, word);
        if (result.ok) {
          log(who, "play", { word: result.word, points: result.points });
          announce(`${nameOf(who)} played ${result.word.toUpperCase()} +${result.points}`);
          if (best.length < 10 || result.points > best.at(-1)!.points) {
            remember({ name: nameOf(who), word: result.word, points: result.points, at: new Date().toISOString() });
          }
        } else {
          log(who, "miss", { word: word.toLowerCase(), why: result.why });
        }
        broadcast();
        return json(res, result.ok ? 200 : 409, result);
      }
    }
  }
  json(res, 404, { error: "not found" });
}).listen(PORT, "0.0.0.0", () => console.log(`fridge rush on :${PORT}, ${words.size} words`));
