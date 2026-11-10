# ADR 0087: Marathon on Real Prices, and Accounts in Australian Dollars

Status: accepted, 5 November 2026. Adds a third market beside Replay and Simulation ([ADR 0012](0012-history-and-live-as-tabs.md), [ADR 0027](0027-scenario-replaces-live.md)), and changes the account's currency of [ADR 0078](0078-pending-orders-an-account-order-panel-and-a-page-that-spans.md) and the credit's amounts of [ADR 0085](0085-a-finer-clock-a-golden-credit-card-and-a-real-calendar.md). Peter asked for each change below and made the four choices marked as his.

Note: Marathon is now Live, Replay is now Rewind, and Simulation is now Random ([ADR 0088](0088-flashback-sandbox-and-live.md) to [0091](0091-one-name-per-thing-in-the-code.md)); this record keeps the names in use when it was written.

## 1 Decision

**Every account is in Australian dollars.** An ANU project's home currency. Peter chose A$10,000 to start, about what ¥1,000,000 was. Credit is A$1,000 a step up to A$10,000, at the same daily rates, on tiers at A$3,000 and A$6,000. A hall saved in yen is divided by a hundred once, a marker recording that it has been.

**Marathon is a market that never closes.** Each player has one account, kept on the volume, traded at any time, across days, until it goes bankrupt: nothing open and under A$100 of net worth. Then the run goes on the Marathon board and, Peter's choice, a new account opens at the next midnight in Sydney. The board lists the accounts that lasted longest, running or bankrupt, in the room's place. There is no round, bell, lobby, pause, speed, prayer, pending order or house trader.

**Real prices, every five seconds.** Peter chose Yahoo Finance's public chart service, reached at its query2 host, which answers from Fly's network where query1 does not. Six dollar rates are polled while anyone has the tab open, and all twenty-one pairs are crossed from them, so every pair agrees with every other. The offshore yuan, CNH, stands for the yuan, since the onshore rate stops overnight. The chart is a pair's fifteen-minute closes over about five days, the newest moving, its days named by date. A price over ten minutes old is a shut market, as at a weekend, and orders wait.

**One position per pair.** Peter's choice. Each pair's result is in its quote currency and counts in Australian dollars at the rate now. The margin call at 50% and stop-out at 20% act on the whole account, and a stop-out closes every pair, worst first. A pair's stop-out price, shown on its chart, is found by halving from the account's own equity, since that pair's price moves its quote currency's worth too. Fees and interest are charged per fifteen-minute slot of real time, and the slots a sleeping machine missed are replayed in order when it wakes.

**Real news.** The central banks' own feeds for the seven currencies, kept to rate decisions and their statements, each linked to the bank's page, are told in the feed and pinned over the chart. The week's high-impact releases, from the ForexFactory calendar, are listed at Sydney time with forecast, previous and actual. Titles are the sources' own, in English.

## 2 Consequences

Yahoo's terms do not cover an app like this; the footer names the source, and Kraken's official API, without the yuan, is the fallback if it is withdrawn. The People's Bank of China has no feed the server can read, so the yuan has calendar releases only. Checks run on a fake price source and never reach the network. The browser check of Marathon against the deployed app is still to do.

## 3 A Later Note: The Yen Conversion Is Left As It Is

Added 10 November 2026, after a review. The one-time division of the careers' money by a hundred writes the careers and then its marker, so a crash between the two writes would divide them a second time on the next start. Writing the marker first only moves the window: a crash then leaves the careers in yen under a marker that says they are converted.

Peter chose to leave it. The conversion ran on 5 November and the careers on the live app are in dollars, so its marker should be on the volume and the code should not run there again (not read from here, as production is not reachable); it could run again only from a data file saved in yen, which no one has. A fix would move saved-data migration, where a mistake could divide real careers a second time and the checks cannot see the live volume. If a yen file ever turns up, the conversion belongs in the store's own migration, which writes a file and its version together.
