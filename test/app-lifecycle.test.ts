import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { ManualClock } from "../src/clock.ts";

it("isolates application instances and releases every owned timer on repeated stop", async () => {
  const dirs = [0, 1].map(() => mkdtempSync(join(tmpdir(), "losscut-instance-")));
  const clocks = dirs.map(() => new ManualClock(Date.parse("2026-11-04T10:00:00Z")));
  const apps = dirs.map((dataDir, i) => createApp({ dataDir, clock: clocks[i], fetch: async () => { throw new Error("offline"); } }));
  try {
    const bases = await Promise.all(apps.map((app) => app.start(0, "127.0.0.1")));
    expect(bases[0]).not.toBe(bases[1]);
    await apps[0].stop();
    expect(clocks[0].pending).toBe(0);
    expect((await fetch(bases[1])).status).toBe(200);
    expect(clocks[1].pending).toBeGreaterThan(0);
  } finally {
    await Promise.all(apps.map((app) => app.stop()));
    await Promise.all(apps.map((app) => app.stop()));
    expect(clocks.map((clock) => clock.pending)).toEqual([0, 0]);
    dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
  }
});

it("cleans up earlier resources when a later persisted dependency refuses startup", () => {
  const dir = mkdtempSync(join(tmpdir(), "losscut-startup-"));
  const clock = new ManualClock(Date.parse("2026-11-04T10:00:00Z"));
  try {
    // a file a newer version wrote, which this one must refuse
    writeFileSync(join(dir, "live.json"), JSON.stringify({}));
    writeFileSync(join(dir, "live.json.version"), "99\n");
    expect(() => createApp({ dataDir: dir, clock })).toThrow(/Unsupported storage version/);
    expect(clock.pending).toBe(0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

it("closes a socket when stop is requested before start has finished listening", async () => {
  const dir = mkdtempSync(join(tmpdir(), "losscut-listen-stop-"));
  const clock = new ManualClock(Date.parse("2026-11-04T10:00:00Z"));
  const app = createApp({ dataDir: dir, clock });
  try {
    const starting = app.start(0, "127.0.0.1");
    await app.stop();
    const base = await starting;
    await expect(fetch(base)).rejects.toThrow();
    expect(clock.pending).toBe(0);
  } finally { await app.stop(); rmSync(dir, { recursive: true, force: true }); }
});
