import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { ManualClock } from "../src/clock.ts";
import type { Action, State, TutorialState } from "../public/protocol.js";

// Compile-time contract probes fail if mode narrowing or action payloads drift.
type Assert<T extends true> = T;
type _TutorialPhase = Assert<Extract<State, { mode: "tutorial" }>["phase"] extends TutorialState["phase"] ? true : false>;
type _NoLiveStart = Assert<Extract<Action, { mode: "live"; kind: "start" }> extends never ? true : false>;
type _BuyRequiresLeverage = Assert<{ mode: "rewind"; kind: "buy" } extends Action ? false : true>;
it("answers each mode with its own state, and no cookie in it", async () => {
  const dir = mkdtempSync(join(tmpdir(), "losscut-contract-"));
  const app = createApp({ dataDir: dir, clock: new ManualClock(Date.parse("2026-11-04T10:00:00Z")) });
  try {
    const base = await app.start(0, "127.0.0.1");
    for (const mode of ["rewind", "random", "live", "tutorial"] as const) {
      const state: State = await (await fetch(`${base}/api/state?mode=${mode}`)).json();
      expect(state.mode).toBe(mode);
      expect(JSON.stringify(state)).not.toMatch(/"cookie"|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
    }
  } finally { await app.stop(); rmSync(dir, { recursive: true, force: true }); }
});
