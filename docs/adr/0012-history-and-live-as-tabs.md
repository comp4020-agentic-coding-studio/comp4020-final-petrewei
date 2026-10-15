# ADR 0012: History and Live as Tabs

Status: accepted, 15 October 2026. Changes the round mix in [ADR 0009](0009-a-parody-fx-trading-floor.md); its rules stand.

## 1 Context

The game ran one market whose rounds alternated: two hidden replays, then a round from today's rate. A player could not choose which they played, and someone who came for the 2008 replays sat through a simulated round to get back to one.

## 2 Options

- **Keep the alternation** in one room.
- **Tabs, both in rounds:** two markets side by side, History and Live, each with its own three-minute rounds; a player picks one by tab.
- **Tabs, Live continuous:** History in rounds, Live one long-running market whose accounts carry on, as the long-term game. Its simulated price drifts from the real rate over hours unless re-anchored, and it needs accounts that outlive rounds.
- **No rounds anywhere,** which loses History's bell and its reveal of the date.

## 3 Decision

Peter asked for modes switched by tab instead of rounds that alternate, and chose rounds in both. Each mode is a `Market` in `src/server.ts` with its own round, desk, house bots, feed and bell, and both run all the time on one clock. A page streams the market its tab picks, kept in the address as `#history` or `#live`; every action names its market, and anything unrecognised means History. The hall of fame stays one ranking across both.

## 4 Consequences

- A room splits by interest: you compete with the people on your tab, and the tabs say how many are on each.
- Switching tabs is a new stream and a fresh account in the other market's round; a position left open on the first tab stays there, and settles at its bell.
- Two markets and eight bots tick together; at this scale the server's work per tick roughly doubles, still far under its budget.
- `spec/modes.test.ts` checks that both run at once and that a trade on one tab never reaches the other.
