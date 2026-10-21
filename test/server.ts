import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A server of the test's own, on a spare port with a throwaway data directory,
// for checks that need to set its environment or kill it.
// `out` collects what the server prints, which is what `flyctl logs` shows.
export type Server = { base: string; dir: string; proc: ChildProcess; out: string[]; restart: () => Promise<void>; stop: () => Promise<void> };

export async function server(port: number, env: Record<string, string> = {}, dir = mkdtempSync(join(tmpdir(), "losscut-"))): Promise<Server> {
  const base = `http://localhost:${port}`;
  const s: Server = { base, dir, proc: undefined as unknown as ChildProcess, out: [], restart, stop };

  async function restart(): Promise<void> {
    s.proc = spawn("node", ["src/server.ts"], { env: { ...process.env, PORT: String(port), DATA_DIR: dir, ...env }, stdio: ["ignore", "pipe", "ignore"] });
    s.proc.stdout!.on("data", (chunk: Buffer) => s.out.push(...chunk.toString().split("\n").filter(Boolean)));
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

  // Waits for the process to be gone, so the next test's server on the
  // same port never answers from this one while it dies.
  async function stop(): Promise<void> {
    const gone = s.proc.exitCode !== null ? Promise.resolve() : new Promise<void>((r) => s.proc.once("exit", () => r()));
    s.proc.kill("SIGKILL");
    await gone;
    rmSync(dir, { recursive: true, force: true });
  }

  await restart();
  return s;
}
