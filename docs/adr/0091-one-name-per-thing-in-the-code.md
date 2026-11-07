# ADR 0091: One Name per Thing, in the Code as on the Page

Status: accepted, 8 November 2026. Follows the renames of [ADR 0088](0088-flashback-sandbox-and-live.md), [ADR 0089](0089-rewind-replaces-flashback.md) and [ADR 0090](0090-random-replaces-sandbox.md). Peter asked for obsolete names to go everywhere, including the saved files.

## 1 Context

The tabs had been renamed, but only what a player reads changed: the code, the protocol, the element ids, the i18n keys and a saved file still used names a player no longer saw, so a reader had to translate each one. Replay, Simulation and Marathon were the tabs' old names; stake was Margin's, until ADR 0085; Dad's savings became emergency credit in ADR 0080; scenario was Simulation's tab and is now the hidden situation behind a Random round.

## 2 Decision

**Each mode's id is its name.** `rewind`, `random` and `live`, in the server, the page, the protocol, the addresses, the element ids, the head counts, the i18n keys and the tests. The Live market is `src/live.ts` and its class `Live`; the price feed it reads, which had been the class `Live`, is `Feed` in `src/feed.ts`.

**Other names follow what they mean.** The margin slider and everything about it on the page is `margin`; the fraction of the account an order puts up, sent with the order, is `share`. The credit offer's dialog and keys are `credit-offer`; the credit lesson's id is `credit`. A Random round's hidden situation is `situation`.

**What stays, deliberately.** `replayRound` and a round's `source: "simulation"` name a mechanism, replaying recorded prices or simulating them, not a tab. Comments that tell history ("which replaced Dad's savings") keep the old name.

**Nothing saved or linked is lost.** Live's accounts move from `marathon.json` to `live.json` once on start, with their backup and version marker, the file last so an interrupted move is redone. Old ids, from a link, a page loaded before the deploy, or a tab remembered in a browser, lead to the tabs they became, and an order sent with `stake` is read as `share`, until such pages reload.

## 3 Consequences

A rollback past this deploy would find no `marathon.json` and start Live's accounts empty until rolled forward again; the move does not run backwards.
