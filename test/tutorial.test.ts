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

// ADR 0052: a lesson points at one control at a time. Its plan is an ordered
// list of steps, each naming the exact element to light. A step is to look
// at something, to set a slider to a value the page can check, or to press the
// button that takes the lesson's action, which every lesson has exactly once.
describe("a lesson's plan", () => {
  const TARGETS = ["chart", "equity", "leverage", "stake", "buy", "sell", "close", "pnl", "level", "stop", "stopthumb", "borrow", "next"];
  const UNTIL = /^(look|press|leverage=\d+|stake=1)$/;
  const plan = (id: string) => LESSONS.find((l) => l.id === id)!.plan;
  it("gives every lesson but the last a plan of steps, each with a known target, condition and words", () => {
    for (const l of LESSONS) {
      expect(l.plan, l.id).toBeInstanceOf(Array);
      if (l.id === "ready") continue;
      expect(l.plan.length, l.id).toBeGreaterThan(0);
      for (const s of l.plan) {
        expect(TARGETS, `${l.id} target ${s.target}`).toContain(s.target);
        expect(s.until, `${l.id} until ${s.until}`).toMatch(UNTIL);
        expect(s.say, `${l.id} says nothing`).toEqual(expect.stringMatching(/\S{3}/));
      }
    }
  });
  it("has exactly one step to press in each lesson, naming the control that takes its action", () => {
    const action: Record<string, string> = { welcome: "next", buy: "buy", "take-profit": "close", sell: "sell", "close-short": "close", leverage: "buy", "cut-loss": "close", "stop-buy": "buy", "stop-set": "stopthumb", gap: "buy", dad: "borrow" };
    for (const l of LESSONS) {
      if (!action[l.id]) continue;
      const pressing = l.plan.filter((s) => s.until === "press");
      expect(pressing.map((s) => s.target), l.id).toEqual([action[l.id]]);
    }
  });
  it("sets the sliders before pressing, and only looks after pressing", () => {
    for (const l of LESSONS) {
      const kinds = l.plan.map((s) => (s.until === "look" ? "look" : s.until === "press" ? "press" : "set"));
      const press = kinds.indexOf("press");
      if (press < 0) continue;
      expect(kinds.slice(0, press).every((k) => k === "set" || k === "look"), `${l.id} before`).toBe(true);
      expect(kinds.slice(press + 1).every((k) => k === "look"), `${l.id} after`).toBe(true);
      // a slider is set after the things to look at have been seen, never between two sliders
      const sets = kinds.map((k, i) => (k === "set" ? i : -1)).filter((i) => i >= 0);
      for (let i = 1; i < sets.length; i++) expect(sets[i] - sets[i - 1], `${l.id} sliders together`).toBe(1);
    }
  });
  it("asks for the leverage and the stake that a lesson's order is checked against", () => {
    const sets = (id: string) => plan(id).filter((s) => /^(leverage|stake)=/.test(s.until)).map((s) => s.until);
    expect(sets("buy")).toEqual(["leverage=1"]);
    expect(sets("sell")).toEqual(["leverage=1"]);
    expect(sets("leverage")).toEqual(["leverage=30", "stake=1"]);
    expect(sets("stop-buy")).toEqual(["leverage=10", "stake=1"]);
    expect(sets("gap")).toEqual(["leverage=30", "stake=1"]);
  });
  it("matches the plan to what the lesson accepts: the leverage a plan sets is the leverage allowed", () => {
    for (const l of LESSONS) for (const s of l.plan) {
      const m = s.until.match(/^leverage=(\d+)$/);
      if (!m) continue;
      const solved = l.solve(new Tutorial());
      if (solved.kind === "order") expect(solved.leverage, l.id).toBe(Number(m[1]));
    }
  });
});

// ADR 0052: the lesson that teaches a 1% stop accepts a stop near 1%, and
// says what was chosen when it is not, not any stop at all.
describe("the stop lesson", () => {
  const atStop = (): Tutorial => {
    const t = new Tutorial();
    while (t.lesson().id !== "stop-set") {
      expect(t.act(t.lesson().solve(t)), t.lesson().id).toBeNull();
      run(t);
    }
    return t;
  };
  it("refuses a stop far from 1%, and names the one chosen", () => {
    const t = atStop();
    for (const pct of [25, 50, 5, 2]) {
      const hint = t.act({ kind: "stop", pct });
      expect(hint, `${pct}%`).toMatch(new RegExp(`${pct}%`));
      expect(hint, `${pct}%`).toMatch(/1%/);
    }
    expect(t.desk.account("me").pos?.stop ?? null).toBeNull();
  });
  it("refuses removing the stop, and accepts a stop at 1% or just past it", () => {
    expect(atStop().act({ kind: "stop", pct: null })).toMatch(/1%/);
    for (const pct of [1, 1.5]) expect(atStop().act({ kind: "stop", pct }), `${pct}%`).toBeNull();
  });
});

// The stop lesson's words and the thumb's track must agree: the Stop Loss
// thumb is nearest the middle line at 1% and furthest from it at 50% (ADR
// 0033), so the lesson must send a beginner towards the middle, never the end.
describe("the stop lesson's directions", () => {
  it("point at the middle line, where 1% is, and never at an end of the track", async () => {
    const { exitPos } = await import("../public/ticket.js");
    expect(exitPos({ kind: "sl", dist: 1 })).toBeGreaterThan(exitPos({ kind: "sl", dist: 50 }));
    expect(exitPos({ kind: "sl", dist: 1 })).toBeGreaterThan(0.4);
    const lesson = LESSONS.find((l) => l.id === "stop-set")!;
    const words = [lesson.task, ...lesson.plan.map((s) => s.say), String(lesson.allow({ kind: "stop", pct: 25 })), String(lesson.allow({ kind: "stop", pct: null }))].join(" ");
    expect(words).toMatch(/middle line/);
    expect(words).not.toMatch(/left end|right end|far left|far right/i);
  });
});

// ADR 0052: which step a lesson points at, from what the player has set and
// how many looks they have had. A step that only looks was never met by
// anything the page could see, so the step after it, the control to press,
// never lit: the Close button and the Stop Loss thumb among them.
describe("which step a lesson points at", () => {
  const plan = (id: string) => LESSONS.find((l) => l.id === id)!.plan;
  const all = () => true;
  const now = async (id: string, ctx: { choice: { leverage: number; stake: number }; looked: number }, seen: (t: string) => boolean = all) => {
    const { currentStep } = await import("../public/plan.js");
    return currentStep(plan(id), ctx, (s: { target: string }) => seen(s.target))?.target ?? null;
  };
  it("looks at each thing in turn, then points at the control to press", async () => {
    const choice = { leverage: 30, stake: 1 };
    expect(await now("welcome", { choice, looked: 0 })).toBe("chart");
    expect(await now("welcome", { choice, looked: 1 })).toBe("equity");
    expect(await now("welcome", { choice, looked: 2 })).toBe("next");
    expect(await now("take-profit", { choice, looked: 0 })).toBe("pnl");
    expect(await now("take-profit", { choice, looked: 1 })).toBe("close");
    expect(await now("cut-loss", { choice, looked: 1 })).toBe("close");
    expect(await now("stop-set", { choice, looked: 1 })).toBe("stopthumb");
  });
  it("sets a slider until it reads the value, and then passes it", async () => {
    expect(await now("buy", { choice: { leverage: 30, stake: 1 }, looked: 0 })).toBe("leverage");
    expect(await now("buy", { choice: { leverage: 1, stake: 1 }, looked: 0 })).toBe("buy");
    expect(await now("leverage", { choice: { leverage: 5, stake: 0.5 }, looked: 0 })).toBe("leverage");
    expect(await now("leverage", { choice: { leverage: 30, stake: 0.5 }, looked: 0 })).toBe("stake");
    expect(await now("leverage", { choice: { leverage: 30, stake: 1 }, looked: 0 })).toBe("buy");
  });
  it("never lights a control that is not on screen, and presses are never met by looking", async () => {
    const choice = { leverage: 30, stake: 1 };
    expect(await now("take-profit", { choice, looked: 9 }, (t) => t !== "close")).toBeNull();
    expect(await now("take-profit", { choice, looked: 9 })).toBe("close");
    expect(await now("dad", { choice, looked: 9 })).toBe("borrow");
  });
  it("counts a look by its place in the plan, so only steps before it were seen", async () => {
    const { met } = await import("../public/plan.js");
    const look = { target: "chart", until: "look", say: "x" };
    expect(met(look, 0, { choice: { leverage: 1, stake: 1 }, looked: 0 })).toBe(false);
    expect(met(look, 0, { choice: { leverage: 1, stake: 1 }, looked: 1 })).toBe(true);
    expect(met(look, 1, { choice: { leverage: 1, stake: 1 }, looked: 1 })).toBe(false);
    expect(met({ target: "buy", until: "press", say: "x" }, 0, { choice: { leverage: 1, stake: 1 }, looked: 99 })).toBe(false);
  });
});
