# ADR 0042: Headed and Foldable Chart and Position

Status: accepted, 28 October 2026; its folded price line removed by [ADR 0043](0043-a-candlestick-icon-and-a-subtitle-at-the-side.md). Extends the folding of [ADR 0039](0039-a-tidier-page.md), and moves Ironman back below Start in the lobby of that ADR.

## 1 Context

Peter asked for Ironman to go back below the Start button, for the button to read "Start Round" in capitals as the other names do, and for the chart and the position to have headings like the other panels, and to fold.

## 2 Decision

**Lobby.** Ironman sits below Start Round again, in a column, the small print still at the foot. English writes Start Round; the Japanese and Chinese buttons are unchanged.

**Two more headings.** The chart panel is headed Chart and the position panel Your position, in all three languages, each folding like the ticket, room, feed and hall of fame. The chart folds to its price line and not to the heading alone, so the round's pause, leave and end buttons, which sit in that line, stay in reach. The tutorial keeps every panel open, as before.

## 3 Consequences

- Six panels fold, and the choice of each is kept in the browser.
- A folded chart still shows the pair, the price, the change, the controls and the clock.
- `test/tips.test.ts` checks the six folding panels, each with a heading, Ironman below Start in a column, and the capitalised label.
- A browser check folded and reopened both panels, saw the saved choices come and go with them, and measured the lobby on a phone, where Ironman and the small print do not touch.
