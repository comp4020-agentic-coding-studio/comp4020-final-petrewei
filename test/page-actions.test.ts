import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { makeAction } from "../public/requests.js";

// Every action a page offers, and the modes it offers it in, in one place. The page's request builder must accept each
// one in each of its modes: twice the builder dropped an action the page offered (a duel and an alert, then Live's
// pending order) before it was ever sent, and the server's own tests, posting directly, never saw it. A new button
// whose action is missing here, or that the builder refuses, fails this check.
const ROUNDS = ["rewind", "random"] as const;
const ORDER = { leverage: 30, share: 0.25, sl: null, tp: null };
const OFFERED: Record<string, { modes: readonly string[]; fields?: Record<string, unknown> }> = {
  // the ticket and the position, in every market
  buy: { modes: [...ROUNDS, "live", "tutorial"], fields: ORDER },
  sell: { modes: [...ROUNDS, "live", "tutorial"], fields: ORDER },
  close: { modes: [...ROUNDS, "live", "tutorial"] },
  stop: { modes: [...ROUNDS, "live", "tutorial"], fields: { pct: 5 } },
  take: { modes: [...ROUNDS, "live", "tutorial"], fields: { pct: 10 } },
  borrow: { modes: [...ROUNDS, "live"] },
  repay: { modes: [...ROUNDS, "live"] },
  pend: { modes: [...ROUNDS, "live"], fields: { side: 1, at: 1.1, ...ORDER } },
  unpend: { modes: [...ROUNDS, "live"] },
  // a round's lobby, controls, prayers, guesses and duels
  start: { modes: ROUNDS },
  choose: { modes: ROUNDS, fields: { what: 1 } },
  pause: { modes: [...ROUNDS, "tutorial"] },
  resume: { modes: ROUNDS },
  finish: { modes: ROUNDS },
  cancel: { modes: ROUNDS },
  hold: { modes: ROUNDS },
  dismiss: { modes: ROUNDS },
  pray: { modes: ROUNDS, fields: { way: 1 } },
  guess: { modes: ROUNDS, fields: { year: 2015 } },
  challenge: { modes: ROUNDS, fields: { code: "a1b2c3" } },
  accept: { modes: ROUNDS, fields: { code: "a1b2c3" } },
  // Live's own
  pair: { modes: ["live"], fields: { pair: "EUR/USD" } },
  alert: { modes: ["live"], fields: { at: 1.1 } },
  unalert: { modes: ["live"], fields: { at: 1.1 } },
  // the tutorial's transport
  play: { modes: ["tutorial"] },
  skip: { modes: ["tutorial"] },
  next: { modes: ["tutorial"] },
  back: { modes: ["tutorial"] },
  again: { modes: ["tutorial"] },
};

it("builds every action a page offers, in every mode it offers it", () => {
  for (const [kind, { modes, fields }] of Object.entries(OFFERED)) {
    for (const mode of modes) expect(() => makeAction(mode as never, kind, fields ?? {}), `${kind} in ${mode}`).not.toThrow();
  }
});

it("lists every action the page's code sends by name", () => {
  // act("…") named in the page; actions sent through a variable are listed above by hand
  const named = new Set<string>();
  for (const f of ["app.js", "tutorial-ui.js", "account.js", "chart.js"]) {
    for (const m of readFileSync(`public/${f}`, "utf8").matchAll(/\bact\("([a-z]+)"/g)) named.add(m[1]);
  }
  for (const kind of named) expect(OFFERED, `the page sends "${kind}"; add it to OFFERED with its modes`).toHaveProperty(kind);
});
