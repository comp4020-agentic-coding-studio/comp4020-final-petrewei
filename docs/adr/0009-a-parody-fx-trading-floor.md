# ADR 0009: A Parody FX Trading Floor

Status: accepted, 15 October 2026. Supersedes ADRs 0002 to 0008, which described the fridge. The round mix is changed by [ADR 0012](0012-history-and-live-as-tabs.md): History and Live are now tabs.

## 1 Context

After crit 9 Peter judged Fridge Poetry, even with scored rounds ([ADR 0008](0008-rounds-with-a-prompt.md)), neither playable nor competitive. A word race on the same fridge (Fridge Rush, a branch never merged) was rejected too: Peter does not find word games fun, and said the fridge itself mattered little and multiplayer mattered most. A survey of about 125 classmates' projects across six crit groups found co-op games, arenas, racing and card games crowded, and no markets, trading or betting at all.

## 2 Options

- **Keep the fridge** and tune its rounds: three crits of process kept, but the judge of fun had said no twice.
- **A strategy game** of territory or auction, crowded among classmates.
- **A live market** of real prices, which move too little in a three-minute round to play.
- **A parody FX trading floor,** Peter's idea: a shared currency market on real or simulated prices, where players compete by prediction and leverage, themed on *FX Fighter Kurumi-chan*.

## 3 Decision

Peter chose the trading floor, asked for mainstream currencies, hidden-date replays of crises such as 2008 and the 2015 franc unpegging, and a mode from today's real price. He played the prototype, found it fun, chose to replace the fridge with it, and named it Losscut! Kurumi's FX Fantasy.

Everyone trades one pair in three-minute rounds of forty trading days. The server owns the price and the broker's rules, modelled on the offshore brokers the comic's heroine uses: leverage from 1× to 1000×, a margin call at 50% margin level, a stop-out at 20%, a zero-cut that sends the player out, and stops that fill at the price that reached them. A broke player may borrow from Dad's savings twice a round, announced to the room and taken off their result. Four original house traders, each a parody of a retail habit, play every round. The rules are in `src/fx.ts` and `src/market.ts`, which keep no clock: the server feeds them prices, so tests drive them tick by tick, with a seeded generator for the market. Round timing is checked on a spawned server with a fast tick.

## 4 Consequences

- Co-presence is the game: one price, one feed of margin calls and stop-outs, one ranking. Two people compete; twelve make a trading floor.
- Something meaningful persists: the hall of fame of profit, wins and busts.
- The theme carries a real harm, leveraged retail trading, and a grim premise. The game uses play money, no broker names or deposit offers, never jokes about the mother's death, and links gambling help.
- The parody uses no official art, names or text. Its title names the heroine, so the page and README say it is a parody and unaffiliated.
- The fridge's process stays in the history and in PROCESS.md; its code, pages and checks are gone.
