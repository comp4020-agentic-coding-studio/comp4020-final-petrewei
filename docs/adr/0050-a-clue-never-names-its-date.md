# ADR 0050: A Clue Never Names Its Date

Status: accepted, 28 October 2026. Corrects [ADR 0030](0030-replay-clues-and-name-that-year.md), whose clues were told to a page by the date they lead to.

## 1 Context

A check that a replay's dates stay off the page until the bell failed once, in a run for another change. It looked for a date in the state sent to every page and found "date":"2015-08-11" in the pinned headline. The clues of ADR 0030 were looked up by the famous day they lead to, so the server sent that day with each clue, in the headline and in the clue's line of the feed. That day is the answer to Name That Year, in the same ADR: a player could read it from the network and guess exactly. The check had missed it before because it only looks when a clue is on screen, and a round with no famous day shows none.

## 2 Decision

A clue is told to a page by a number, its place in the clue table, whose order is the same in every language, never by the date. The page finds the words by that number, and the date does not leave the server until the bell. The server draws famous days as it did; only how a clue is named has changed.

A setting, EVENT_CHANCE, now says how often a replay hides a famous day, six in ten as before, so a check can make every round hide one and not wait for luck.

## 3 Consequences

- Before the bell a page learns nothing about when its replay is from, in the headline, a feed line or a clue.
- `test/rounds.test.ts` plays six replays that each hide a famous day, reads every state and every feed line while trading, fails on any date or any clue that names one, and requires that a clue was shown, so it cannot pass by checking nothing. It failed first, with 2022-09-26 in a clue, and again when the date was put back, and passes with the fix.
- `test/i18n.test.ts` checks that the clue table has the same dates in the same order in every language, one entry for each famous day the server can draw, so a number cannot point at the wrong words.
- A browser check showed a clue in the mode line and the feed as before, and a fresh state with no date anywhere in its feed.
- This is a flaw in an earlier change, found by a check that passed most runs; it was not caused by the tooltip work beside which it was found, and is recorded apart.
