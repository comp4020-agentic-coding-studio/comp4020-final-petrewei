import { afterEach, expect, it } from "vitest";
import { type Server, server } from "./server.ts";

// Crit 10: the logging outlives the crit. Every action is appended to a log on
// the volume, so the record survives a restart or a hard kill, and /stats
// reads from it, not just from memory.
const KEY = "test-key-activity-0123456789";
type Line = { t: string; who: string; ev: string; word?: string };
let s: Server;
afterEach(() => s.stop());

const recent = async (): Promise<Line[]> =>
  ((await (await fetch(`${s.base}/api/stats?key=${KEY}`)).json()) as { recent: Line[] }).recent;

it("keeps the record of who did what through a hard kill", async () => {
  s = await server(8097, { STATS_KEY: KEY });
  await fetch(`${s.base}/api/magnets/m20`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ x: 0.5, y: 0.1 }),
  });
  expect((await recent()).some((l) => l.ev === "move" && l.word === "moon")).toBe(true);
  s.proc.kill("SIGKILL");
  await new Promise((r) => s.proc.once("exit", r));

  await s.restart();
  expect((await recent()).some((l) => l.ev === "move" && l.word === "moon")).toBe(true);
}, 20_000);
