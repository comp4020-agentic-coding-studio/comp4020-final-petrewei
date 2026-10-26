# ADR 0027: Scenario Replaces Live

Status: accepted, 26 October 2026. Changes the Live tab of [ADR 0012](0012-history-and-live-as-tabs.md).

## 1 Context

Live started from today's real rate and simulated forty days as a random walk at the pair's own volatility, doubled, with an occasional shock. It had no reveal worth waiting for and nothing to read, so it was History without the payoff. Peter wanted to keep a simulated mode, and plans a separate Marathon mode later for long runs. The agent proposed turning Live into a scripted mode, and Peter chose to call it Scenario.

## 2 Decision

A Scenario round starts from today's real rate and plays out one of six hidden scripts, each modelled on a real market: a **peg** held still then broken in a day (Switzerland, 2015), a **carry** trade's long climb and sudden unwind (the yen, 2024), a policy **shock** and the trend after it (the yuan, 2015), a **bubble** that turns (sterling, 2016), a **chop** with no trend that takes stops both ways, and an **intervention** that reverses a slide (Japan, 2022). A script sets each day's drift and wildness in multiples of the pair's real daily volatility over the past year; the turning day is drawn, so the calendar does not give it away, and each round runs either way up, so selling every round is no plan.

Two headlines per script, on set days, drop clues into the feed, and the latest stays pinned under the price, so a careful trader can read the script coming. At the bell the script is named, with the real market it was modelled on. Names, notes and headlines are written in each language in `public/i18n-long.js`; the server sends a headline by its script and number, and each page tells it in its own language.

The tab is Scenario, シナリオ and 剧本 to players; inside the code, its mode stays `live`, since thirty references and players' remembered tab choice use that name.

## 3 Consequences

- The simulated tab has a reveal and a skill: reading the headlines and the shape.
- Each script teaches a pattern that has ruined real traders, which suits the parody.
- The generator is its own function in `src/market.ts`, so a later Marathon can draw its rounds from Scenario and History alike.
- `test/market.test.ts` checks that every script leaves its shape in the prices over thirty seeds, that each runs both ways, that prices stay finite, and that every script and headline is told in every language.
