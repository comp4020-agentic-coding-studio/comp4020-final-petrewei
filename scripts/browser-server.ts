import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "losscut-browser-"));
const child = spawn(process.execPath, ["src/server.ts"], {
  env: { ...process.env, PORT: "8187", DATA_DIR: dir, TICK_MS: "100", COUNTDOWN_TICKS: "10", STATS_KEY: "", MARATHON_NEWS: "off" },
  stdio: "inherit",
});
for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => {
  rmSync(dir, { recursive: true, force: true });
  process.exit(code ?? 0);
});
child.on("error", (error) => {
  rmSync(dir, { recursive: true, force: true });
  console.error(error.message);
  process.exit(1);
});
