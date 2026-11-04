# ADR 0078: Pending Orders, an Account / Order Panel, and a Page That Spans

Status: accepted, 4 November 2026. Builds on [ADR 0077](0077-the-account-in-the-stake-and-a-leaner-card.md). Peter asked for the card to be called Account / Order and be as tall as the chart, for amounts to give way to percentages, for SL and TP beside their slider, for the yen sign in every language, for a conditional buy or sell at a price, and then for the position, the feed, the room and the hall of fame to use the page's width.

## 1 Context

The card's preview spent a line on "¥500,000 controls ¥15,000,000", though the game ranks by percentage. The exit toggles took a row each. A player could act only at the price of the moment, so waiting for a level meant watching for it. Below the chart, the position was one narrow table, the feed and the room had different heights, and the hall listed totals in yen with no sense of a trader's run.

## 2 Decision

**A pending order, one at a time.** The ticket's Pending order section sets Buy or Sell, whether the price must rise or fall to reach the level, and how far, from the same six distances as the exits. The two choices name the FX entry order: buying below the price is a Buy Limit, above it a Buy Stop, and so for selling. The page sends only those choices, the leverage, the stake and the exits; the server sets the level from its own price, and when a tick reaches it, fills it as a click on Buy or Sell would be filled then, with the same stake rule and refusals (Peter chose both: one at a time, and filled as a click). A new one replaces the old; it is cancelled on the ticket or on its row under the position, and is cleared when the player is cut out or caught. The tutorial refuses it, as a lesson for later.

**One Account / Order card, as tall as the chart.** The account sits on top, as Peter suggested, then the order. The preview keeps only what a move against you costs. The SL and TP switches stand at the two ends of their joined track; their full names did not fit, and Peter allowed the abbreviations there and only there, which a check holds.

**The yen sign everywhere.** Amounts read ¥1,000,000 in every language. In Chinese ¥ is also the yuan's sign; Peter chose the symbol over 日元 knowing that, since every amount in the game is yen and the page says so.

**The page spans.** The position row adds its P&L as a percentage, as its largest figure, its exits and the price of its forced loss cut; a waiting pending order is a row of its own. The feed and the room are one height on a desktop. The latest news is pinned at the top of the feed, since it is what moves the price. The room lists you, then other people, then the house traders, each by net worth. The hall of fame spans the page with each trader's best round as a percentage of the start, a line of their last 20 round scores, and bars for the picked trader's recent rounds, yourself at first. The server keeps those scores with each career, from the score the bell gave.

## 3 Consequences

At 1366 by 657, the card is about 25px over while the pending section is open; it is closed by default, and the card scrolls within itself. Careers saved before this have no recent scores, so their line starts with their next round.
