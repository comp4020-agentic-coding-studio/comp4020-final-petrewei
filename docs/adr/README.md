# Decision Records

Each record keeps the decision as it was made. A later record that changes or replaces one says so in both records' Status lines, so the history of a choice can be followed from either end.

The modes were renamed twice. Records written before 7 November use the names in use then: Replay and History are now Rewind, Simulation and Scenario are now Random, and Marathon is now Live ([ADR 0088](0088-flashback-sandbox-and-live.md) to [0091](0091-one-name-per-thing-in-the-code.md)).

## 1 Decisions That Shape the Game Now

- [0001](0001-plain-node-and-a-json-file.md) Plain Node and a JSON file, over a framework or SQLite
- [0009](0009-a-parody-fx-trading-floor.md) A parody FX trading floor replaces Fridge Poetry
- [0010](0010-who-may-see-and-change-what.md) Who may see and change what, decided on the server
- [0013](0013-a-private-tutorial.md) A private tutorial, now ten lessons
- [0014](0014-simultaneous-actions.md) Simultaneous actions applied one at a time
- [0015](0015-three-languages-and-the-comics-characters.md) Three languages, and the comic's characters
- [0016](0016-the-address-names-the-language.md) The address names the language, never the market
- [0017](0017-chosen-trader-names.md) Chosen trader names
- [0019](0019-a-hidden-debug-mode.md) A hidden debug mode, gated by the operator's key
- [0022](0022-a-rounds-controls.md) A round's controls
- [0026](0026-a-losscut-ends-your-round.md) A losscut ends your round
- [0029](0029-a-fairer-score.md) A fairer score
- [0058](0058-a-fee-that-grows-with-leverage-and-a-scale-for-every-rung.md) A fee that grows with leverage
- [0063](0063-the-page-keeps-no-copy-of-the-desk.md) The page keeps no copy of the desk
- [0073](0073-real-minutes-for-replay.md) Real minutes for Rewind
- [0075](0075-a-shorter-finer-clock.md) A five-day, finer clock
- [0080](0080-emergency-credit-replaces-dads-savings.md) Emergency credit replaces Dad's savings
- [0087](0087-marathon-on-real-prices-and-accounts-in-australian-dollars.md) Live on real prices, and accounts in Australian dollars
- [0091](0091-one-name-per-thing-in-the-code.md) One name per thing, in the code as on the page
- [0092](0092-round-messages-send-what-changed.md) Round messages send what changed
- [0094](0094-every-pair-either-way-round.md) Every pair, either way round
- [0095](0095-gameplay-for-the-player-and-the-room.md) Gameplay for the player and the room
- [0096](0096-an-ai-agent-plays-live-through-mcp.md) An AI agent plays Live through MCP
- [0097](0097-the-house-traders-are-live-players.md) The house traders are Live players
- [0098](0098-live-news-from-investing-com-and-no-release-calendar.md) Live's news from Investing.com, and no release calendar

## 2 Replaced or Superseded

- [0002](0002-one-hand-at-a-time.md) to [0008](0008-rounds-with-a-prompt.md): Fridge Poetry, replaced by [0009](0009-a-parody-fx-trading-floor.md)
- [0011](0011-daily-rates-bridged-into-ticks.md) Daily rates bridged into ticks: replaced by real minutes, [0073](0073-real-minutes-for-replay.md), except for the two yuan plots
- [0012](0012-history-and-live-as-tabs.md), [0027](0027-scenario-replaces-live.md), [0028](0028-history-becomes-replay.md), [0046](0046-scenario-is-a-random-simulation.md), [0047](0047-simulation-replaces-scenario.md), [0088](0088-flashback-sandbox-and-live.md), [0089](0089-rewind-replaces-flashback.md), [0090](0090-random-replaces-sandbox.md): the tabs' names, settled as Rewind, Random and Live
- [0032](0032-stop-loss-and-take-profit.md) to [0037](0037-sliders-on-the-position.md): the exits' controls, settled as sliders on the position
- [0057](0057-dads-savings-are-taken-not-borrowed.md) Dad's savings: replaced by emergency credit, [0080](0080-emergency-credit-replaces-dads-savings.md)
- [0062](0062-thirty-day-rounds-and-a-chart-that-opens-full.md) Thirty-day rounds: replaced by the five-day clock, [0075](0075-a-shorter-finer-clock.md)
- [0069](0069-round-selection-beside-the-quote.md) and [0071](0071-explicit-tutorial-controls-and-short-tick-labels.md): controls redone by [0070](0070-replay-pairs-and-a-centred-countdown.md) and [0072](0072-the-tutorial-plays-like-a-disc.md)

## 3 Smaller Decisions

The rest record how the page looks and reads, refined after looking at it: the header, folding panels, the tips, the tutorial's pointer and card, the background music, the account panel, the position and the credit card. They stand unless a later record in the same area says otherwise.
