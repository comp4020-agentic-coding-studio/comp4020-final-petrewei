# ADR 0067: The Simplify Pass, Finished

Status: accepted, 29 October 2026. Completes the review of [ADR 0066](0066-a-choice-is-for-one-round.md), whose reuse and simplification reviews had not run.

## 1 Context

Two of the four reviews of the market changes stopped when the key's spending limit was reached. I asked for them to be finished once the limit was raised, and they were run over the same changes.

## 2 Decision

**Taken.**

- The distance ladder's three helpers were a copy of the leverage ladder's; the distance functions are now the same ones under their own names.
- A Replay round always has a plot, so the year it is "from" and the text shown at the bell no longer fall back to a middle day, and two comments that described removed things are gone.
- Two ids in the page that nothing read, and an alias for the list of plots, are gone.
- A prayer's `way` is made 1 or -1 once, where it arrives, and not again where it is counted.
- The log says which way a prayer asked for, and the lobby's menu no longer shadows the page's `pick` helper.
- A test comment still said "1% to 50%".

## 3 What was not done

- **The round's `event` is still typed as possibly empty,** since a Simulation has none; narrowing it needs a type for each mode, which is more than a cleanup.
- **Two tests that repeat each other,** the list of distances and the order of the ladder, stay. Each is short and reads a different file.
- **The distances are not built from one list in the strings and refusals.** They are table keys in three languages, and a change there reaches every translation.

## 4 Consequences

The checks pass unchanged: 355 tests. The fault this pass found in the design, a choice outliving its round, was already fixed by ADR 0066.
