import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";

// ADR 0006: a move confirmed to its visitor survives SIGKILL, the one exit
// the server can't flush on. Starts its own server on a spare port with a
// throwaway data directory, kills it hard straight after a move, and starts
// it again on the same directory.
const PORT = 8099;
const base = `http://localhost:${PORT}`;
const dir = mkdtempSync(join(tmpdir(), "fridge-journal-"));
const procs: ReturnType<typeof spawn>[] = [];
afterEach(() => {
  for (const p of procs) p.kill("SIGKILL");
  rmSync(dir, { recursive: true, force: true });
});

async function start(): Promise<ReturnType<typeof spawn>> {
  const p = spawn("node", ["src/server.ts"], { env: { ...process.env, PORT: String(PORT), DATA_DIR: dir }, stdio: "ignore" });
  procs.push(p);
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(base);
      return p;
    } catch {
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  throw new Error("server did not start");
}

it("keeps a confirmed move after the server is killed outright", async () => {
  const first = await start();
  const res = await fetch(`${base}/api/magnets/m7`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ x: 0.4242, y: 0.2121 }),
  });
  expect(res.status).toBe(200);
  first.kill("SIGKILL");
  await new Promise((r) => first.once("exit", r));

  await start();
  const { magnets } = (await (await fetch(`${base}/api/magnets`)).json()) as { magnets: { id: string; x: number; y: number }[] };
  expect(magnets.find((m) => m.id === "m7")).toMatchObject({ x: 0.4242, y: 0.2121 });
}, 20_000);
