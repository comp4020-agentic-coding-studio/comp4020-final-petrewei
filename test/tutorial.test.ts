import { describe, expect, it } from "vitest";
import { START } from "../src/fx.ts";
import { LESSONS, Tutorial } from "../src/tutorial.ts";

// The tutorial is one player's private market, run lesson by lesson. Each
// lesson accepts only the action it teaches, and the price moves only
// along the lesson's script, so every idea happens on cue.
const run = (t: Tutorial): void => {
  while (t.moving()) t.step();
};

describe("the tutorial", () => {
  it("starts at the first lesson with a fresh account and a still price", () => {
    const t = new Tutorial();
    expect(t.lesson().id).toBe(LESSONS[0].id);
    const before = t.price();
    t.step();
    expect(t.price()).toBe(before);
  });

  it("moves on from a lesson with only reading to do", () => {
    const t = new Tutorial();
    expect(t.act({ kind: "next" })).toBeNull();
    expect(t.lesson().id).toBe(LESSONS[1].id);
  });

  it("refuses an action the lesson does not teach, with a hint", () => {
    const t = new Tutorial();
    t.act({ kind: "next" });
    const refused = t.act({ kind: "order", side: -1, leverage: 1 });
    expect(refused).toMatch(/a Buy at 1×/);
    expect(t.desk.account("me").pos).toBeNull();
  });

  it("plays the lesson's price path after the right action, then waits", () => {
    const t = new Tutorial();
    t.act({ kind: "next" });
    const start = t.price();
    expect(t.act({ kind: "order", side: 1, leverage: 1 })).toBeNull();
    expect(t.moving()).toBe(true);
    run(t);
    expect(t.price()).toBeGreaterThan(start);
    expect(t.moving()).toBe(false);
  });

  it("can be played from start to finish, every lesson in order", () => {
    const t = new Tutorial();
    const seen: string[] = [];
    for (let i = 0; i < 60 && !t.finished(); i++) {
      seen.push(t.lesson().id);
      const refused = t.act(t.lesson().solve(t));
      expect(refused, `${t.lesson().id}: ${refused}`).toBeNull();
      run(t);
    }
    expect(t.finished()).toBe(true);
    expect([...new Set(seen)]).toEqual(LESSONS.map((l) => l.id));
  });

  it("shows a margin call, a stop that slips in a gap, and a stop-out along the way", () => {
    const t = new Tutorial();
    const kinds = new Set<string>();
    for (let i = 0; i < 60 && !t.finished(); i++) {
      t.act(t.lesson().solve(t));
      while (t.moving()) for (const e of t.step()) kinds.add(e.kind);
    }
    expect(kinds).toContain("call");
    expect(kinds).toContain("stop");
    expect(kinds).toContain("zerocut");
  });

  it("starts over on request", () => {
    const t = new Tutorial();
    t.act({ kind: "next" });
    t.restart();
    expect(t.lesson().id).toBe(LESSONS[0].id);
    expect(t.desk.account("me").balance).toBe(START);
  });
});
