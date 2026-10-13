import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A server of the test's own, on a spare port with a throwaway data directory,
// for checks that need to set its environment or kill it.
export type Server = { base: string; dir: string; proc: ChildProcess; restart: () => Promise<void>; stop: () => void };

export async function server(port: number, env: Record<string, string> = {}, dir = mkdtempSync(join(tmpdir(), "fridge-"))): Promise<Server> {
  const base = `http://localhost:${port}`;
  const s: Server = { base, dir, proc: undefined as unknown as ChildProcess, restart, stop };

  async function restart(): Promise<void> {
    s.proc = spawn("node", ["src/server.ts"], { env: { ...process.env, PORT: String(port), DATA_DIR: dir, ...env }, stdio: "ignore" });
    for (let i = 0; i < 100; i++) {
      try {
        await fetch(base);
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 50));
      }
    }
    throw new Error("server did not start");
  }

  function stop(): void {
    s.proc.kill("SIGKILL");
    rmSync(dir, { recursive: true, force: true });
  }

  await restart();
  return s;
}
