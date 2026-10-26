# ADR 0036: Exit Chips Under the Position

Status: accepted, 26 October 2026. Replaces the chart dragging of [ADR 0035](0035-drag-exits-on-the-chart.md); the capital names of that ADR stand, and the dialog of [ADR 0032](0032-stop-loss-and-take-profit.md) returns.

## 1 Context

Peter tried dragging the Stop Loss and Take Profit lines on the chart and found it not intuitive. He asked for the exits back on the position panel, made compact. They had made Close overflow because they were two more columns of the position's row.

## 2 Decision

**Two chips on their own line.** Under the position row sit two chips of equal width, "+ Stop Loss" and "+ Take Profit", dashed and grey while there is none; once set, each reads its name and distance, such as "Stop Loss 5.00%", in red or green. A click opens the small dialog of ADR 0032: a distance slider, the price it would sit at, what it would lose or make, Set and Remove. The row itself is as before, six columns ending in Close, so Close has its room; on a phone the chips sit side by side below it.

**Gone: the chart handles.** The "+" handles, the drag and the ✕ are removed, with their arithmetic in `public/ticket.js` and its tests. The chart still draws each exit as a line. The tutorial's stop lesson asks again for "+ Stop Loss" on the position.

## 3 Consequences

- Close and both exits are visible at once at 360px and on a desktop.
- `test/tips.test.ts` checks that the chips are outside the position table and the dialog is on the page, and that English never writes the lowercase names.
- A browser check set a stop loss from the chip and read the desk's price back at the 5% shown.
