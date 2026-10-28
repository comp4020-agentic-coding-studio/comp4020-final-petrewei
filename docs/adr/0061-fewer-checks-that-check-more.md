# ADR 0061: Fewer Checks That Check More

Status: accepted, 29 October 2026. Changes how the checks of [ADR 0025](0025-tips-and-pictures.md), [ADR 0052](0052-a-tutorial-that-points.md) and others are kept; their text still names tests that have since been merged or removed.

## 1 Context

Peter asked for all the checks and tests to be reviewed, refined and simplified, with the redundant and obsolete ones removed. There were 354 tests taking 85 seconds, and most of the time was a few files that each played a whole round to read one thing from it.

## 2 Decision

**A rule for what stays.** A check stays if it would fail on something a player would feel, or enforces a promise the project makes: three languages, no cookie out, the server's authority, the desk's rules. It is merged with another if the two only read different things from the same setup. It goes if it pins how the code is written, repeats another check, or guards a feature that no longer exists. The rule is now in `CLAUDE.md`.

**What went.**

- Fifteen tests in `test/tips.test.ts` that matched source text in `app.js` and `app.css`: the order of calls in `render`, the shape of an event handler, a `z-index`, a `grid-template-columns`. They broke on harmless edits and said nothing a browser did not. One run of the real page in a browser showed what they guarded, and all of it held: the lit ring survives redraws, it goes on another tab and returns, it does not dim, a click on the card does not move a step on and one on the page does, and the card sits above the lit control and under its words.
- Tests that a removed feature stays removed: Leave, Why?, the round-info button, the mode line, the space under Pray. A deleted button does not come back by itself.
- A test played one round each to read a ranking, a hall, a stdout line, a face and a lobby after the bell. Five of them share one round now, with every assertion kept, and a face and a name share one hard kill.
- A repeated test of a double click.
- A stale `left` field in the score test that passed by being undefined.

**What changed shape.** The fee check no longer matches `const FEE = 1e-9`: it runs the page's own `feePct` and compares it with the desk's `feeRate`, so it fails only if the page shows a different fee than the desk charges.

**What stayed, and why.** `test/rounds.test.ts` still plays six rounds looking for a replay's date on the wire, and the two Dad tests, because the first protects the game's secret and the second two paths differ. The `spec/` checks of refused orders and stops stay though `test/fx.test.ts` covers the same rules in the desk: they are the only check that production hands a request to the desk correctly, and they run against the deployed app.

## 3 Consequences

- 324 tests in 67 seconds, from 354 in 85, with no coverage lost on what I probed.
- I broke 33 things in the desk, score, server, tutorial, translations and page, one at a time. The suite caught 30, one pattern did not match, and the three that survived were mutations that changed nothing, such as an unused import. Written properly, they were caught too: a debug key open to anyone by five tests, a clause splitter that drops a clause by six, a wrong favicon colour by one. Three merged tests were checked the same way after merging, and each went red.
- The ring, the dimming, the stacking and the click behaviour of the tutorial are no longer guarded by `pnpm check`. They are checked in a browser, by hand, when the tutorial changes. This is a real loss of automatic protection, traded for checks that do not break on a reformat.
- The older ADRs still name some tests that were merged or removed. They are history and are left as they were.
- It took too long: the 33-mutation sweep alone ran about 25 minutes, and I ran the weak mutations twice. A sweep that size is not worth repeating; the three-mutation check after a merge is.
