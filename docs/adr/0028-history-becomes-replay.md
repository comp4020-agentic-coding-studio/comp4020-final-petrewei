# ADR 0028: History Becomes Replay

Status: accepted, 26 October 2026. Renames the History tab of [ADR 0012](0012-history-and-live-as-tabs.md), as [ADR 0027](0027-scenario-replaces-live.md) renamed Live.

## 1 Context

With Live renamed Scenario, Peter asked for a better name for History. The agent offered Replay, Mystery Date, Time Machine, Archive, Real Market and Flashback, and advised against Peter's idea of Epic: about two rounds in five hide no famous day, so a tab called Epic would over-promise; it would not say the prices are real; and エピック and 史诗 read as a game's difficulty or loot rarity. Peter chose Replay.

## 2 Decision

The tab is Replay, リプレイ and 回放, and its mode is `replay` in the code, its keys renamed with it. Replay and Scenario now read as a pair: a real past with a hidden date, and a made-up future with a hidden script. The game already called these rounds replays in the feed.

The old name still works, as Live's does: the server reads `history` as `replay`, and a browser that remembered the History tab, or an old `/#history` link, opens Replay. One table, in the server and in the page, maps both old names.

What keeps its name: the `History` class in `src/market.ts`, which is the ECB's rate history, not the tab; the browser's `history` API; and 历史最低, "an all-time low", in an event's note.

## 3 Consequences

- リプレイ is shorter than ヒストリー, so the Japanese tab has more room.
- `spec/modes.test.ts` checks that `history` is read as Replay, and that an unknown mode falls back to Replay.
