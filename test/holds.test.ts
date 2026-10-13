import { describe, expect, it } from "vitest";
import { Holds } from "../src/holds.ts";

// ADR 0002's hold rules with a clock the test controls, since a real hold
// takes 30 seconds to lapse. Every way a hold ends must reach the log.

function setup() {
  let now = 0;
  const ended: string[] = [];
  const holds = new Holds({ ms: 30_000, now: () => now, ended: (id, who, why) => ended.push(`${who} ${why} ${id}`) });
  return { holds, ended, tick: (ms: number) => (now += ms) };
}

describe("holds", () => {
  it("refuse a second hand until the first lets go", () => {
    const { holds } = setup();
    expect(holds.grab("w", "a")).toBe("new");
    expect(holds.grab("w", "a")).toBe("renewed");
    expect(holds.holder("w")).toBe("a");
    expect(holds.grab("w", "b")).toBe("refused");
  });

  it("log a lapse when a hold runs out, swept on its own", () => {
    const { holds, ended, tick } = setup();
    holds.grab("w", "a");
    tick(30_001);
    expect(holds.holder("w")).toBeNull();
    holds.sweep();
    expect(ended).toEqual(["a lapse w"]);
  });

  it("log the lapse before someone else's grab, even if the sweep hasn't run", () => {
    const { holds, ended, tick } = setup();
    holds.grab("w", "a");
    tick(30_001);
    expect(holds.grab("w", "b")).toBe("new");
    expect(ended).toEqual(["a lapse w"]);
    expect(holds.holder("w")).toBe("b");
  });

  it("log the lapse before a release, and let nobody free someone else's hold", () => {
    const { holds, ended, tick } = setup();
    holds.grab("w", "a");
    expect(holds.release("w", "b")).toBe(false);
    expect(holds.holder("w")).toBe("a");
    tick(30_001);
    expect(holds.release("w", "b")).toBe(false);
    expect(ended).toEqual(["a lapse w"]);
  });

  it("keep a hold that is renewed in time", () => {
    const { holds, ended, tick } = setup();
    holds.grab("w", "a");
    tick(20_000);
    holds.grab("w", "a");
    tick(20_000);
    holds.sweep();
    expect(holds.holder("w")).toBe("a");
    expect(ended).toEqual([]);
  });

  it("log a release, and a drop when the holder leaves", () => {
    const { holds, ended } = setup();
    holds.grab("w", "a");
    holds.grab("x", "a");
    holds.grab("y", "b");
    expect(holds.release("w", "a")).toBe(true);
    holds.drop("a");
    expect(ended).toEqual(["a release w", "a drop x"]);
    expect(holds.holder("y")).toBe("b");
  });

  it("end silently when the holder moves the word, since the move is logged", () => {
    const { holds, ended } = setup();
    holds.grab("w", "a");
    holds.moved("w");
    expect(holds.holder("w")).toBeNull();
    expect(ended).toEqual([]);
  });
});
