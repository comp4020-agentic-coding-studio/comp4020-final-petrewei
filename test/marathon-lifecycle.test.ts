import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { Marathon, type Who } from "../src/marathon.ts";
import { Live, SLOT_MS } from "../src/live.ts";
import { ManualClock } from "../src/clock.ts";
import { News } from "../src/news.ts";
import { STEP } from "../src/fx.ts";
import { spark } from "./feed.ts";
const who: Who = { nameAt: () => ({ name: "Test", draw: null }), named: () => true, key: (key) => key, short: (key) => key.slice(0, 6), name: () => "Test", draw: () => null, face: () => "p0", faceAt: () => "p0" };
const quiet = () => { const news = new News(async () => "[]"); news.banks = async () => []; return news; };
it("does not settle an extended refresh that finishes after the account owner stops", async () => {
  const start = Date.parse("2026-11-04T10:00:00Z"); let now = start;
  const dir = mkdtempSync(join(tmpdir(), "losscut-pending-refresh-"));
  let release!: (value: ReturnType<typeof spark>) => void;
  let requested!: () => void;
  const requestedPromise = new Promise<void>((resolve) => { requested = resolve; });
  const pending = new Promise<ReturnType<typeof spark>>((resolve) => { release = resolve; });
  const live = new Live(async (url) => {
    if (url.includes("range=1mo")) { requested(); return pending; }
    return spark(now / 1000, [(now === start ? start : start + SLOT_MS) / 1000]);
  }, () => now);
  let changes = 0;
  const market = new Marathon(dir, who, { live, news: quiet(), clock: new ManualClock(start), watching: () => 0, onChange: () => changes++, log: () => {} });
  try {
    await market.refresh(now);
    expect(market.act("trader", { kind: "borrow" }, now)).toBeNull();
    const before = market.slot; const events = changes;
    now += 3 * SLOT_MS;
    const refreshing = market.refresh(now);
    await requestedPromise;
    market.dispose();
    release(spark(now / 1000, [1, 2, 3].map((n) => (start + n * SLOT_MS) / 1000)));
    await refreshing;
    expect(market.slot).toBe(before);
    expect(market.accounts.get("trader")!.debt).toBe(STEP);
    expect(changes).toBe(events);
  } finally { market.dispose(); rmSync(dir, { recursive: true, force: true }); }
});
it("settles a permanently absent trading slot at its carried price and charges it exactly once", async () => {
  const start = Date.parse("2026-11-04T10:00:00Z"); let now = start;
  const dir = mkdtempSync(join(tmpdir(), "losscut-carried-slot-"));
  const live = new Live(async () => spark(now / 1000, Array.from({ length: (now - start) / SLOT_MS + 1 }, (_, n) => start + n * SLOT_MS).filter((time) => time !== start + SLOT_MS).map((time) => time / 1000)), () => now);
  const market = new Marathon(dir, who, { live, news: quiet(), clock: new ManualClock(start), watching: () => 0, onChange: () => {}, log: () => {} });
  try {
    await market.refresh(now);
    expect(market.act("trader", { kind: "borrow" }, now)).toBeNull();
    now += 6 * SLOT_MS;
    await market.refresh(now);
    const expected = STEP * (1 + 0.005 / 96) ** 6;
    expect(market.accounts.get("trader")!.debt).toBeCloseTo(expected, 8);
    await market.refresh(now);
    expect(market.accounts.get("trader")!.debt).toBeCloseTo(expected, 8);
  } finally { market.dispose(); rmSync(dir, { recursive: true, force: true }); }
});
