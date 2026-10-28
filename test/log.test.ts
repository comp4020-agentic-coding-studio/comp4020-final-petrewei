import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { client } from "../spec/helpers.ts";
import { type Server, server } from "./server.ts";

// Crit 10 and ADR 0010: the server logs who did what by short code, the log
// and the hall of fame outlive a hard kill, and only the holder of
// STATS_KEY may read the log. A server of its own, with a fast clock.
const KEY = "test-key-log-0123456789abcdef";
type Line = { t: string; who: string; name?: string; ev: string; side?: string; leverage?: number };
type Log = { here: number; recent: Line[] };
let s: Server;
afterEach(() => s.stop());

const log = async (): Promise<Log> => (await fetch(`${s.base}/api/log?key=${KEY}`)).json() as Promise<Log>;
const app = () => client(s.base);

it("opens the log with the key, and to nobody else", async () => {
  s = await server(8097, { STATS_KEY: KEY });
  expect((await fetch(`${s.base}/log?key=${KEY}`)).status).toBe(200);
  expect((await fetch(`${s.base}/api/log?key=${KEY}`)).status).toBe(200);
  for (const q of ["", "?key=wrong", `?key=${KEY}x`]) expect((await fetch(`${s.base}/api/log${q}`)).status).toBe(404);
});

it("is shut to everyone when no key is set", async () => {
  s = await server(8097);
  expect((await fetch(`${s.base}/api/log?key=`)).status).toBe(404);
});

it("tells two traders apart by short code and name, never by cookie", async () => {
  s = await server(8097, { STATS_KEY: KEY, TICK_MS: "100" });
  const { visitor, act, open } = app();
  const a = await visitor();
  const b = await visitor();
  await open(30);
  await act(a, { kind: "buy", leverage: 30 });
  await act(b, { kind: "sell", leverage: 5 });
  const trades = (await log()).recent.filter((l) => l.ev === "open" && l.side);
  const buy = trades.find((l) => l.side === "buy" && l.leverage === 30)!;
  const sell = trades.find((l) => l.side === "sell" && l.leverage === 5)!;
  expect(buy.who).toMatch(/^[0-9a-f]{6}$/);
  expect(sell.who).toMatch(/^[0-9a-f]{6}$/);
  expect(buy.who).not.toBe(sell.who);
  expect(buy.name).toEqual(expect.any(String));
  expect(JSON.stringify(await log())).not.toContain(a.slice(2));
  // the bots trade too, but only people's lines are kept
  expect((await log()).recent.some((l) => l.who.startsWith("bot:"))).toBe(false);
}, 20_000);

it("keeps the log and the hall of fame through a hard kill", async () => {
  s = await server(8097, { STATS_KEY: KEY, TICK_MS: "10", COUNTDOWN_TICKS: "2" });
  const { visitor, act, open, state } = app();
  const a = await visitor();
  // a wipe-out at 1000x is recorded at once, before the round ends; a
  // round that ends first is started again, until one does
  let busted = false;
  for (const until = Date.now() + 20_000; !busted && Date.now() < until; ) {
    if ((await state()).phase !== "trade") await open(30);
    const st = await state(a);
    if (!st.you.pos && !st.you.out && !st.you.broke) await act(a, { kind: "buy", leverage: 1000 });
    await new Promise((r) => setTimeout(r, 25));
    busted = (await log()).recent.some((l) => l.ev === "stopout" || l.ev === "zerocut");
  }
  expect(busted).toBe(true);
  const fame = async () => (await state(a)).career;
  expect((await fame()).find((c) => c.you)?.busts).toBeGreaterThanOrEqual(1);

  s.proc.kill("SIGKILL");
  await new Promise((r) => s.proc.once("exit", r));
  await s.restart();
  expect((await log()).recent.some((l) => l.ev === "stopout" || l.ev === "zerocut")).toBe(true);
  expect((await fame()).find((c) => c.you)?.busts).toBeGreaterThanOrEqual(1);
}, 30_000);

// The bell names everyone in the room when it rings, and nothing in what it
// sends is a cookie. A person who sat the round out with the tab open is ranked
// as sitting out, one who looked and left is not there at all, and a career
// starts with a trade, so neither gets a row in the hall of fame. One round
// carries all of it.
it("ranks the room at the bell, logs the round to stdout, and waits in the lobby after it", async () => {
  s = await server(8097, { TICK_MS: "10", COUNTDOWN_TICKS: "2" });
  const { visitor, act, open, page, state } = app();
  const trader = await visitor();
  const watcher = await visitor();
  const passer = await visitor();
  const glance = await page(passer);
  await glance.next(() => true, 2000);
  glance.close();
  const watching = await page(watcher);
  try {
    await open(30);
    await act(trader, { kind: "buy", leverage: 5 });
    let bell = await state(watcher);
    for (const until = Date.now() + 10_000; bell.phase !== "break" && Date.now() < until; ) bell = await state(watcher);
    expect(bell.phase).toBe("break");
    // no cookie anywhere in what the bell sends
    for (const c of [trader, watcher, passer]) expect(JSON.stringify(bell)).not.toContain(c.slice(2));
    type Row = { code: string; you: boolean; sat?: boolean };
    const ranking = (bell as unknown as { result: { ranking: Row[] } }).result.ranking;
    const mine = ranking.find((r) => r.you);
    expect(mine?.code).toBe(bell.you.code);
    expect(mine?.sat).toBe(true);
    const traderCode = (await state(trader)).you.code;
    const passerCode = (await state(passer)).you.code;
    expect(ranking.find((r) => r.code === traderCode)?.sat).toBeFalsy();
    expect(ranking.some((r) => r.code === passerCode)).toBe(false);
    // ranked first, everyone who traded; then, unranked, who sat out
    expect(ranking.findIndex((r) => r.sat)).toBe(ranking.length - 1);
    // the hall lists the one who traded, and not the one who watched
    expect(bell.career.some((c) => c.you)).toBe(false);
    const hall = (await state(trader)).career;
    expect(hall.filter((c) => c.rounds > 0)).toHaveLength(1);
    expect(hall[0].you).toBe(true);
    // a person is shown the same face in the room, at the bell and in the hall
    // (ADR 0021): a house trader's name or a plain face's number, nothing else
    type Faced = { face: string; you: boolean };
    const myFace = ((await state(trader)).you as unknown as Faced).face;
    const traderRow = (await state(trader)) as unknown as { result: { ranking: Faced[] } };
    expect(traderRow.result.ranking.find((r) => r.you)?.face).toBe(myFace);
    expect((hall as unknown as Faced[]).find((c) => c.you)?.face).toBe(myFace);
    for (const r of ranking as unknown as Faced[]) expect(r.face).toMatch(/^(bot:\w+|p\d+)$/);
    // Crit 10 is narrated from `flyctl logs`, the server's stdout: people's actions
    // and the round's end are printed, and the bots, who trade every few seconds and
    // would bury two classmates' lines, print nothing.
    expect(s.out.some((l) => / open who=[0-9a-f]{6} /.test(l))).toBe(true);
    expect(s.out.some((l) => / end who=server /.test(l))).toBe(true);
    expect(s.out.filter((l) => / who=bot:/.test(l))).toEqual([]);
    // after the bell the market waits in the lobby, and does not start the next round by itself
    let seen = await state(watcher);
    for (const until = Date.now() + 15_000; seen.phase !== "lobby" && Date.now() < until; ) seen = await state(watcher);
    expect(seen.phase).toBe("lobby");
    await new Promise((r) => setTimeout(r, 500));
    expect((await state(watcher)).phase).toBe("lobby");
  } finally {
    watching.close();
  }
}, 40_000);

// The hall of fame is for people. A bot never gets a row, after any number
// of rounds, and a saved hall holding one (from an older version, or by
// hand) is cleaned when the server starts.
it("keeps the house traders out of the hall of fame", async () => {
  const dir = mkdtempSync(join(tmpdir(), "losscut-"));
  writeFileSync(join(dir, "career.json"), JSON.stringify({
    "bot:kurumi": { name: "Kurumi", rounds: 9, profit: 9e9, wins: 9, busts: 0, best: 9e9 },
    "0123456789abcdef": { name: "Hikari", rounds: 1, profit: 5, wins: 0, busts: 0, best: 5 },
  }));
  writeFileSync(join(dir, "hall-given-names"), "1");
  s = await server(8097, { TICK_MS: "10", COUNTDOWN_TICKS: "2" }, dir);
  const { visitor, act, open, state } = app();
  const bots = ["Kurumi", "Mochiko", "Yasuko", "Mebuki", "Inago", "Nana", "Kizuna"];
  const names = async () => (await state()).career.map((c) => c.name);
  expect(await names()).toEqual(["Hikari"]);
  const a = await visitor();
  await open(30);
  await act(a, { kind: "buy", leverage: 5 });
  let bell = await state(a);
  for (const until = Date.now() + 10_000; bell.phase !== "break" && Date.now() < until; ) bell = await state(a);
  expect(bell.phase).toBe("break");
  for (const name of await names()) expect(bots, name).not.toContain(name);
}, 20_000);

// Lecture 10: a request ID ties an event to the request that caused it.
// stdout, which `flyctl logs` shows, prints one readable line per event,
// tagged with its request, and one line per request with its status and
// time; an event the clock caused, such as a stop-out, has no request.
it("tags each action and its request with one ID, readably, on stdout", async () => {
  s = await server(8097, { STATS_KEY: KEY, TICK_MS: "10", COUNTDOWN_TICKS: "2" });
  const { visitor, act, open } = app();
  const a = await visitor();
  await open(30);
  await act(a, { kind: "buy", leverage: 5 });
  await act(a, { kind: "sell", leverage: 7 });
  await new Promise((r) => setTimeout(r, 200));
  const opened = s.out.find((l) => / open who=[0-9a-f]{6} /.test(l) && /side=buy/.test(l));
  expect(opened, s.out.join("\n")).toMatch(/^\[[0-9a-f]{6}\] open who=[0-9a-f]{6} name=[A-Z][a-z]+ mode=replay .*side=buy leverage=5/);
  const id = opened!.slice(1, 7);
  expect(s.out).toContainEqual(expect.stringMatching(new RegExp(`^\\[${id}\\] POST /api/act 200 \\d+ms who=[0-9a-f]{6}$`)));
  expect(s.out).toContainEqual(expect.stringMatching(/^\[[0-9a-f]{6}\] refused .*why="No such leverage\."/));
  expect(s.out).toContainEqual(expect.stringMatching(/\] POST \/api\/act 409 \d+ms/));
  expect(s.out.some((l) => l.includes(a.slice(2)))).toBe(false);
  // The saved log, read by /log, stays JSON and carries the same ID.
  const saved = (await log()).recent;
  expect(saved.find((l) => l.ev === "open")).toMatchObject({ req: id });
}, 30_000);

// Lecture 10 and ADR 0014: two people pressing Start at the same moment
// start one round, and the second is told it is already about to start.
it("starts one round when two people press Start at once", async () => {
  s = await server(8097, { STATS_KEY: KEY });
  const { visitor, page, attempt, state } = app();
  expect((await state(undefined, "simulation")).phase).toBe("lobby");
  const a = await visitor();
  const b = await visitor();
  const pa = await page(a, "simulation");
  const pb = await page(b, "simulation");
  try {
    const [ra, rb] = await Promise.all([attempt({ kind: "start", mode: "simulation" }, a), attempt({ kind: "start", mode: "simulation" }, b)]);
    expect([ra.status, rb.status].sort()).toEqual([200, 409]);
    expect((await (ra.status === 409 ? ra : rb).json()).error).toMatch(/about to start/);
    expect((await state(undefined, "simulation")).phase).toBe("countdown");
    expect((await log()).recent.filter((l) => l.ev === "ask")).toHaveLength(1);
  } finally {
    pa.close();
    pb.close();
  }
}, 20_000);

// Lecture 10: a visitor is the same person after a restart. The name and
// code come from the cookie, so a hard kill changes neither, and the hall
// of fame still marks their row as theirs. A chosen face is kept on the volume
// too, so it outlives the kill, in the room and in the hall (ADR 0021).
it("keeps a visitor's name, code, chosen face and career through a hard kill", async () => {
  s = await server(8097, { TICK_MS: "10", COUNTDOWN_TICKS: "2" });
  const { visitor, act, open, state } = app();
  type Me = { you: { name: string; code: string; face: string }; career: { you: boolean; rounds: number; face: string }[] };
  const a = await visitor();
  const face = (await state(a) as unknown as Me).you.face === "p5" ? "p6" : "p5";
  const chose = await fetch(`${s.base}/api/face`, { method: "POST", headers: { "content-type": "application/json", cookie: a }, body: JSON.stringify({ face }) });
  expect(chose.status).toBe(200);
  await open(30);
  await act(a, { kind: "buy", leverage: 5 });
  let seen = await state(a);
  for (const until = Date.now() + 15_000; seen.phase !== "break" && seen.phase !== "lobby" && Date.now() < until; ) seen = await state(a);
  const before = seen as unknown as Me;
  expect(before.career.find((c) => c.you)?.face, "the hall shows the chosen face").toBe(face);
  s.proc.kill("SIGKILL");
  await new Promise((r) => s.proc.once("exit", r));
  await s.restart();
  const after = (await state(a)) as unknown as Me;
  expect(after.you).toMatchObject({ name: before.you.name, code: before.you.code, face });
  expect(after.career.find((c) => c.you)).toMatchObject({ rounds: 1, face });
}, 30_000);

// ADR 0029: the bell gives each trader a score, and the hall ranks only
// players with enough rounds, by average score; a career saved before
// scores is given one from its profit.
it("scores the bell, and ranks the hall by average score over enough rounds", async () => {
  const dir = mkdtempSync(join(tmpdir(), "losscut-"));
  writeFileSync(join(dir, "career.json"), JSON.stringify({
    "aaaaaaaaaaaaaaaa": { name: "Old Hand", rounds: 4, profit: 200_000, wins: 1, busts: 0, best: 90_000 },
    "bbbbbbbbbbbbbbbb": { name: "One Hit", rounds: 1, profit: 900_000, wins: 1, busts: 0, best: 900_000 },
  }));
  writeFileSync(join(dir, "hall-given-names"), "1");
  s = await server(8097, { TICK_MS: "10", COUNTDOWN_TICKS: "2" }, dir);
  const { visitor, act, open, state } = app();
  type Row = { name: string; ranked: boolean; average: number; points: number };
  const hall = (await state()).career as unknown as Row[];
  // the old career's 20% over 4 rounds is 5 points a round; one big round is not ranked
  expect(hall.find((c) => c.name === "Old Hand")).toMatchObject({ ranked: true, average: 5 });
  expect(hall.find((c) => c.name === "One Hit")?.ranked).toBe(false);
  expect(hall.findIndex((c) => c.name === "Old Hand")).toBeLessThan(hall.findIndex((c) => c.name === "One Hit"));
  const a = await visitor();
  await open(30);
  await act(a, { kind: "buy", leverage: 5 });
  let bell = await state(a);
  for (const until = Date.now() + 10_000; bell.phase !== "break" && Date.now() < until; ) bell = await state(a);
  const ranking = (bell as unknown as { result: { ranking: { score: number; sat: boolean }[] } }).result.ranking.filter((r) => !r.sat);
  for (const r of ranking) expect(r.score).toEqual(expect.any(Number));
  // ranked by score, best first
  for (let i = 1; i < ranking.length; i++) expect(ranking[i - 1].score).toBeGreaterThanOrEqual(ranking[i].score);
}, 20_000);

// ADR 0038: names became given names alone, and the hall began again once.
// A hall saved before that is emptied when the server first starts, a
// marker beside it says so, and one saved after is kept.
it("empties an older hall once, then keeps the new one", async () => {
  const dir = mkdtempSync(join(tmpdir(), "losscut-"));
  writeFileSync(join(dir, "career.json"), JSON.stringify({ "0123456789abcdef": { name: "Dojima Hikari", rounds: 4, profit: 5, wins: 1, busts: 0, best: 5 } }));
  s = await server(8097, { TICK_MS: "10", COUNTDOWN_TICKS: "2" }, dir);
  expect((await app().state()).career).toEqual([]);
  s.proc.kill("SIGKILL");
  await new Promise((r) => s.proc.once("exit", r));
  writeFileSync(join(dir, "career.json"), JSON.stringify({ "0123456789abcdef": { name: "Hikari", rounds: 4, profit: 5, wins: 1, busts: 0, best: 5 } }));
  await s.restart();
  expect((await app().state()).career.map((c) => c.name)).toEqual(["Hikari"]);
}, 20_000);
