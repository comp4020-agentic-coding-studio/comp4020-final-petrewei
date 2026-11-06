import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";

it("expires a disconnected tutorial paused during an animation without moving its price while paused", async () => {
  const dir = mkdtempSync(join(tmpdir(), "losscut-tutorial-clock-"));
  try {
    // The real HTTP server, with only its clock and interval scheduler replaced. Advancing two hours takes no sleep.
    const { stdout } = await promisify(execFile)(process.execPath, ["--input-type=module", "--eval", `
      const timers = [];
      globalThis.setInterval = (fn, ms) => { timers.push({ fn, ms }); return { unref() { return this; } }; };
      let now = Date.now();
      Date.now = () => now;
      const base = "http://127.0.0.1:8198";
      const realFetch = globalThis.fetch;
      globalThis.fetch = (url, options) => String(url).startsWith(base) ? realFetch(url, options) : Promise.reject(new Error("test offline"));
      try {
        await import("./src/server.ts");
        const response = await fetch(base + "/api/state?mode=tutorial");
        const cookie = response.headers.get("set-cookie").match(/v=[^;]+/)[0];
        const act = async (kind, extra = {}) => {
          now += 1000;
          const res = await fetch(base + "/api/act", {
            method: "POST", headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ mode: "tutorial", kind, ...extra }),
          });
          if (!res.ok) throw new Error(await res.text());
        };
        const state = async () => (await fetch(base + "/api/state?mode=tutorial", { headers: { cookie } })).json();
        await act("play");
        await act("next");
        await act("buy", { leverage: 1 });
        await act("pause");
        const paused = await state();
        const tick = timers.find((timer) => timer.ms === 100).fn;
        tick();
        const held = await state();
        now += 2 * 60 * 60 * 1000;
        tick();
        timers.find((timer) => timer.ms === 600_000).fn();
        const expired = await state();
        console.log(JSON.stringify({ paused: paused.transport, priceHeld: JSON.stringify(paused.prices) === JSON.stringify(held.prices), expired: expired.transport, lesson: expired.lesson.id }));
        process.exit(0);
      } catch (error) {
        console.error(error);
        process.exit(1);
      }
    `], { env: { ...process.env, PORT: "8198", DATA_DIR: dir, TICK_MS: "100", MARATHON_NEWS: "off", STATS_KEY: "" }, timeout: 10_000 });
    expect(JSON.parse(stdout.trim().split("\n").at(-1)!)).toEqual({ paused: "paused", priceHeld: true, expired: "stopped", lesson: "welcome" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
