import { expect, it } from "vitest";
import { makeAction } from "../public/requests.js";
it("constructs mode-specific requests and rejects missing required choices before sending", () => {
  expect(makeAction("replay", "buy", { leverage: 10 })).toEqual({ mode: "replay", kind: "buy", leverage: 10, stake: 1, sl: null, tp: null });
  expect(makeAction("marathon", "close", { pair: "EUR/USD" })).toEqual({ mode: "marathon", kind: "close", pair: "EUR/USD" });
  expect(makeAction("replay", "stop")).toEqual({ mode: "replay", kind: "stop", pct: null });
  expect(makeAction("tutorial", "stop", { pct: 1 })).toEqual({ mode: "tutorial", kind: "stop", pct: 1 });
  expect(makeAction("tutorial", "stop")).toEqual({ mode: "tutorial", kind: "stop" });
  expect(() => makeAction("marathon", "start")).toThrow("Invalid action for mode");
  expect(() => makeAction("simulation", "buy")).toThrow("Invalid action number");
});
