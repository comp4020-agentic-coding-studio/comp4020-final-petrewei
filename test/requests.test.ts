import { expect, it } from "vitest";
import { makeAction } from "../public/requests.js";
it("constructs mode-specific requests and rejects missing required choices before sending", () => {
  expect(makeAction("rewind", "buy", { leverage: 10 })).toEqual({ mode: "rewind", kind: "buy", leverage: 10, share: 1, sl: null, tp: null });
  expect(makeAction("live", "close", { pair: "EUR/USD" })).toEqual({ mode: "live", kind: "close", pair: "EUR/USD" });
  expect(makeAction("rewind", "stop")).toEqual({ mode: "rewind", kind: "stop", pct: null });
  expect(makeAction("tutorial", "stop", { pct: 1 })).toEqual({ mode: "tutorial", kind: "stop", pct: 1 });
  expect(makeAction("tutorial", "stop")).toEqual({ mode: "tutorial", kind: "stop" });
  expect(() => makeAction("live", "start")).toThrow("Invalid action for mode");
  expect(() => makeAction("random", "buy")).toThrow("Invalid action number");
});
