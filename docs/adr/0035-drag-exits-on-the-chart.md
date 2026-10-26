# ADR 0035: Drag the Exits on the Chart

Status: accepted, 26 October 2026; the chart dragging replaced by [ADR 0036](0036-exit-chips-under-the-position.md). Replaces the position cells and dialog of [ADR 0032](0032-stop-loss-and-take-profit.md); the ticket of [ADR 0034](0034-a-toggle-for-each-exit.md) stands.

## 1 Context

Peter found that the Stop Loss and Take Profit cells on the position panel made Close overflow, and asked for them to go. He also asked that the English names be written "Stop Loss" and "Take Profit", not "Stop loss" and "Take profit".

## 2 Decision

**Drag on the chart.** The position panel is back to six columns, ending in Close, and the editing dialog is gone. Peter chose that an open position's exits are changed by dragging their lines on the chart. A line is grabbed within a few pixels, its distance is previewed as it moves, and letting go sends it to the desk, which places it exactly that far from its own price. A drag to the wrong side or onto the price stops at 1%, and one past 50% stops at 50%. A small ✕ at the line's left end removes it.

**A handle where there is none.** Peter chose that a position with no exit shows a faint "+ Stop Loss" handle on the chart below the price, and "+ Take Profit" above it for a long, swapped for a short. It is dragged out like a line. The arithmetic, from pointer height to price to distance, is in `public/ticket.js` as `lineY`, `priceAt` and `dragDistance`.

**Capitals.** English now says Stop Loss and Take Profit everywhere a player reads it, including the desk's refusals; Japanese and Chinese are unchanged. The tutorial's stop lesson asks the player to drag the "+ Stop Loss" line to 1%.

## 3 Consequences

- Close has the panel to itself, on a desktop and at 360px.
- Dragging works with a pointer or a finger, and the chart takes no scroll from a drag that starts on a line.
- `test/ticket.test.ts` checks the drag arithmetic; `test/tips.test.ts` that the page has no exit cells or dialog and that English never writes the lowercase names.
- A browser check dragged a take profit and a stop loss, read the desk's prices back at the distances shown (a stop loss at 2.2% away), and removed one with the ✕.
