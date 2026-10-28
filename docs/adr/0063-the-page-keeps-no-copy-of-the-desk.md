# ADR 0063: The Page Keeps No Copy of the Desk

Status: accepted, 29 October 2026. Follows a review of the whole repository for reuse, simplicity, efficiency and altitude; changes the page's use of the numbers of [ADR 0058](0058-a-fee-that-grows-with-leverage-and-a-scale-for-every-rung.md) and [ADR 0059](0059-a-card-that-always-reads-and-a-ladder-with-even-rungs.md).

## 1 Context

Four reviews of the repository, one for each of reuse, simplification, efficiency and altitude, were run side by side. Two of them found the same thing from different sides: the page held its own copies of the desk's numbers, the fee, the legal cap, the top rung, a default ladder, and the ¥300,000 that Dad's savings offer. A change to any of them on the server would have left the page showing the old one, and one check existed only to keep the fee in step by reading the page's source.

## 2 Decision

**The server sends its numbers.** Every state carries `desk`, the legal cap, the fee a tick and the amount Dad's savings offer, with how many ticks make a minute, beside the ladder it already sent. The page reads them, and draws its sliders only once they arrive. A new visitor starts at the cap. The field is `desk` and not `rules`, which a state already uses for whether this visitor may cancel or end the round.

**Pure functions in `ticket.js`.** The fee a minute, the heat of a slider and its colour moved out of `app.js`, so the checks run the real functions instead of cutting them out of the page's source.

**Smaller things the reviews found, all done.** A `post` helper replaces three copies of the same request and its refusal; the price change on the chart uses `pct`, as the rest of the page does, so it prints a true minus and never rounds a small move to zero; new prices go on the end of the page's own array and not into a copy of all of it each tick; and `ticket.js` holds a position to its ends in one place. Dead things went: six translation keys nothing read, a news icon for the Leave button, a pixel trophy, an empty span and its rule, a style rule for an element that has no children, a doubled comment, and an `export` nothing imported.

## 3 What was not done

The reviews also found things that were left alone, for reasons:

- **The tutorial and the markets build their state in two places** (`tutorialView` and `view`), and the page branches on mode in seven places. A single builder and a flag for what each mode allows is the right shape, but it touches every state the page receives and the tutorial's whole flow, which is more than a cleanup.
- **A lesson is a list of hooks, a move counter and a step number**, where it should be an ordered list of phases. The same holds for `autoMove` naming the 1% stop in a third place. Changing it means rewriting how all ten lessons are written.
- **`Account` carries `out`, `caught` and `recall`** where one status would do. The desk's rules rest on them, and a change there wants its own tests first.
- **The server serialises one state for each listener**, and rebuilds the count of who is on each tab for each of them. That costs more with hundreds of viewers, and this game has a handful. Reading the code showed it, and nothing here measured it, so it was left.
- **Indicators and candles are worked out again each tick**, which costs microseconds. Caching them adds a way to go stale for a gain nobody has felt.
- **The palette read in each draw** is a live object, so the lookups are cheap, and caching it would need to follow the theme.

## 4 Consequences

- A change to the cap, the fee, the ladder or the Dad amount in `src/fx.ts` shows on the page with no edit there. `spec/modes.test.ts` checks that every state carries them and that they equal the desk's own.
- The page no longer draws its sliders until the first state arrives, which is the moment it learns the ladder.
- A browser check showed the ladder, the fee note, the cap's note and heat, a round whose price moved on every sample, a reload in the middle of a round, and no page errors.
- Each review was a read of the code, not a measurement. The ones taken were checked by hand first, and one of the reviewers' dead-code claims, `wipedRow`, was a false positive that the reviewer caught for itself.
