# ADR 0030: Replay Clues and Name That Year

Status: accepted, 26 October 2026; its clues told by number, not date, by [ADR 0050](0050-a-clue-never-names-its-date.md). Adds to the Replay tab of [ADR 0028](0028-history-becomes-replay.md), and to the score of [ADR 0029](0029-a-fairer-score.md); Replay plays thirteen plots by [ADR 0064](0064-thirteen-plots-and-a-lobby-that-chooses.md).

## 1 Context

A replay's best moment is the reveal at the bell, but between daily closes the price is noise, so there was little to read before it, and the reveal came to everyone alike. The agent suggested clues before a famous day, and a contest to name the year; Peter chose both.

## 2 Decision

**Clues.** A replay that hides a famous day drips two headlines before it, a third and two thirds of the way there, through the same feed line and pinned headline as Scenario's ([ADR 0027](0027-scenario-replaces-live.md)). Each tells the mood the market was in, never the event or its year: before Lehman, "A large investment bank's shares have halved this week"; before the franc, "The central bank calls its currency floor 'the cornerstone' of policy". A replay with no famous day has none, as markets mostly give no warning. The clues are written in each language in `public/i18n-long.js`.

**Name that year.** Halfway through a replay, a row under the order controls asks for the year it is from. A trader may guess, privately, and change it until the bell; the right year adds 5 points to their score, one year off adds 2. The year is the famous day's, or the middle day's when there is none, so a window over New Year is fair. The bell shows each guess, a hit in green, with its bonus in the row's tip. A guess counts only for someone who traded, since it adds to a score; a watcher's guess is shown but scores nothing.

The round's controls, a growing chain of `if`s in the server, became one table: a kind maps to the market method that checks its phase and who may act, and guessing is one more row.

## 3 Consequences

- A careful trader has something to read before the event, and a reason to think about when, not only which way.
- The bell's reveal becomes a moment to be right in, not only to learn.
- `test/market.test.ts` checks every famous day has two clues in every language, before the day, naming neither the event nor a year, and a plain replay has none; `test/score.test.ts` the bonus; `test/rounds.test.ts` that a guess is refused before halfway, outside a replay, from off the tab, or as a bad year, that it stays private, and that the bell shows it.
