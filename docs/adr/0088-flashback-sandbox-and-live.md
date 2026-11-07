# ADR 0088: Flashback, Sandbox and Live

Status: accepted, 7 November 2026. Renames the tabs of [ADR 0012](0012-history-and-live-as-tabs.md), [ADR 0047](0047-simulation-replaces-scenario.md) and [ADR 0087](0087-marathon-on-real-prices-and-accounts-in-australian-dollars.md). Peter chose the names below.

## 1 Context

With a fourth tab, the names no longer said what set the markets apart. Marathon said how long a run lasts, not that its prices are real and now, and sat oddly beside a mode called Simulation, when every mode is a simulation in the sense of play money. Japanese still called Simulation シナリオ, a name English and Chinese had dropped.

## 2 Decision

**Each tab is named for where its prices come from.** Replay is Flashback: a sudden return to one real day the market broke, lived through before it is named. Simulation is Sandbox: a made-up market to play in. Marathon is Live: real prices, now. Tutorial is unchanged. In Japanese they are フラッシュバック, 箱庭 and ライブ; in Chinese 闪回, 沙盒 and 实时, not 实盘, which means a real-money account. The tab icons follow: a film strip for Flashback, a flask for Sandbox, and the satellite dish, which had stood for Simulation, for Live.

**Only what a player reads changes.** The modes keep their ids, `replay`, `simulation` and `marathon`, in the server, the address a page asks for, the saved tab, the accounts on the volume and the checks, so nothing saved is lost. The About page and README now describe four tabs, Live among them.

**An address names the tab a player sees.** `#flashback`, `#sandbox` and `#live` open their tabs. `#live` was once Simulation's first name, and old links sent it there; it now opens the real-prices tab it names. `#history` and `#scenario` still open Flashback and Sandbox.

## 3 Consequences

フラッシュバック is the longest tab label; the tabs fit every language at every width checked, from 360px to 1920px.
