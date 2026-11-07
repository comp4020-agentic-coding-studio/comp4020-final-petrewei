# ADR 0090: Random Replaces Sandbox

Status: accepted, 7 November 2026. Renames one tab of [ADR 0088](0088-flashback-sandbox-and-live.md). Peter chose the name.

## 1 Context

Peter wanted no metaphor in the tab names. Sandbox named a use, a safe place to play, while Rewind and Live name where the prices come from, and its Chinese and Japanese, 沙盒 and 箱庭, were metaphors too.

## 2 Decision

**The invented-market tab is Random**: its prices are drawn at random, new every round. Peter preferred it to Simulated, which says more but is long and brings back the name dropped in ADR 0088. In Japanese it is ランダム and in Chinese 随机, both literal. Its icon is a die, 🎲. The mode keeps its id, `simulation`.

**Addresses.** `#random` opens the tab, and `#sandbox` still does.

## 3 Consequences

The name leaves out the hidden situation that shapes each round; the tab's tip, the lobby and the About page say it, and the bell names it.
