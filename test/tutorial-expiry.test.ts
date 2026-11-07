import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { ManualClock } from "../src/clock.ts";
import { client } from "../spec/helpers.ts";

it("expires a disconnected tutorial paused during an animation without moving its price while paused", async () => {
  const dir = mkdtempSync(join(tmpdir(), "losscut-lifecycle-"));
  const clock = new ManualClock(Date.parse("2026-11-04T10:00:00Z"));
  const app = createApp({ dataDir: dir, clock, fetch: async () => { throw new Error("offline"); } });
  try {
    const base = await app.start(0, "127.0.0.1");
    const c = client(base);
    const me = await c.visitor();
    for (const action of [{ kind: "play" }, { kind: "next" }, { kind: "buy", leverage: 1 }, { kind: "pause" }]) {
      clock.advance(1);
      expect((await c.act(me, { mode: "tutorial", ...action })).status).toBe(200);
    }
    const before = await c.state(me, "tutorial");
    clock.advance(500);
    expect((await c.state(me, "tutorial")).prices).toEqual(before.prices);
    // A position stop request must not be interpreted as the transport Stop button.
    expect((await c.act(me, { mode: "tutorial", kind: "stop", pct: 1 })).status).toBe(409);
    expect((await c.state(me, "tutorial")).transport).toBe("paused");
    clock.advance(2 * 60 * 60_000);
    const expired = await fetch(`${base}/api/state?mode=tutorial`, { headers: { cookie: me } }).then((r) => r.json());
    expect(expired.transport).toBe("stopped");
    expect(expired.lesson.id).toBe("welcome");
  } finally {
    await app.stop();
    await app.stop();
    expect(clock.pending).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  }
});
