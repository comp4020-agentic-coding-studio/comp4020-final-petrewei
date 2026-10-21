# ADR 0012: History and Live as Tabs

Status: accepted, 15 October 2026. Changes the round mix in [ADR 0009](0009-a-parody-fx-trading-floor.md); its rules stand. Amended the same day: rounds wait for a Start (section 5). The countdown, and controls to cancel, end, leave and hold a round, are in [ADR 0022](0022-a-rounds-controls.md).

## 1 Context

The game ran one market whose rounds alternated: two hidden replays, then a round from today's rate. A player could not choose which they played, and someone who came for the 2008 replays sat through a simulated round to get back to one.

## 2 Options

- **Keep the alternation** in one room.
- **Tabs, both in rounds:** two markets side by side, History and Live, each with its own three-minute rounds; a player picks one by tab.
- **Tabs, Live continuous:** History in rounds, Live one long-running market whose accounts carry on, as the long-term game. Its simulated price drifts from the real rate over hours unless re-anchored, and it needs accounts that outlive rounds.
- **No rounds anywhere,** which loses History's bell and its reveal of the date.

## 3 Decision

Peter asked for modes switched by tab instead of rounds that alternate, and chose rounds in both. Each mode is a `Market` in `src/server.ts` with its own round, desk, house bots, feed and bell, and both tick on one clock. A page streams the market its tab picks, kept in the address as `#history` or `#live`; every action names its market, and anything unrecognised means History. The hall of fame stays one ranking across both.

## 4 Consequences

- A room splits by interest: you compete with the people on your tab, and the tabs say how many are on each.
- Switching tabs is a new stream and a fresh account in the other market's round; a position left open on the first tab stays there, and settles at its bell.
- Two markets and eight bots tick together; at this scale the server's work per tick roughly doubles, still far under its budget.
- `spec/modes.test.ts` checks that both run at once and that a trade on one tab never reaches the other.

## 5 Amendment: Rounds Wait for a Start

Peter then asked that History and Live not start by themselves. The agent offered three readings: rounds that wait for a Start, rounds that run on while players join on purpose, or a start screen before any market. Peter chose the first. Each market now waits in a lobby, its next round drawn but its price still; anyone with that tab open may press Start, which the server checks, and a ten-second countdown lets others join before trading opens. After the bell the market returns to the lobby. The bots trade only in a round, so an empty tab costs nothing, and `spec/lobby.test.ts` checks each step. A check that the price moves by itself became a check that it moves once a round is running.
