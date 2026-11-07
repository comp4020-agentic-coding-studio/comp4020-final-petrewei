import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spark } from "../test/yahoo-fake.ts";

// A fixed quote source for browser checks, struck now, so Live trades at any hour, weekends included.
const feed = createServer((_req, res) => {
  const now = Math.floor(Date.now() / 1000);
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(spark(now, [now - 900])));
}).listen(0, "127.0.0.1");
await once(feed, "listening");
const address = feed.address();
if (!address || typeof address === "string") throw new Error("the fake quote source has no port");
const dir = mkdtempSync(join(tmpdir(), "losscut-browser-"));
const child = spawn(process.execPath, ["src/server.ts"], {
  env: { ...process.env, PORT: "8187", DATA_DIR: dir, TICK_MS: "100", COUNTDOWN_TICKS: "10", STATS_KEY: "", LIVE_NEWS: "off", LIVE_FEED: process.env.LIVE_FEED ?? `http://127.0.0.1:${address.port}` },
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
