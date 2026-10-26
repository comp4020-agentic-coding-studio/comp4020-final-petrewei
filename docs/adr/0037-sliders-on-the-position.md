# ADR 0037: Sliders on the Position

Status: accepted, 27 October 2026. Replaces the chips and dialog of [ADR 0036](0036-exit-chips-under-the-position.md); puts the ticket control of [ADR 0034](0034-a-toggle-for-each-exit.md) on the open position.

## 1 Context

Peter tried chips that open a dialog and still wanted sliders on the position panel, as on the ticket. The chart handles of ADR 0035 and the chips of ADR 0036 had each been set aside.

## 2 Decision

**The ticket's control, on the position.** Under the position row sit the same two toggles and one joined track: Stop Loss at the left with its percentage, Take Profit at the right, a thumb for each, red and green when the exit is on and grey when off. The table keeps its six columns ending in Close, so Close is not crowded.

**It acts on the open position.** A toggle that is off puts the exit on at the distance shown; one that is on takes it off. Dragging a thumb sends nothing until it is let go; then the desk places the exit exactly that far from its own price, so the page still sends only a distance. An exit already on, from the order or the desk, shows at its distance now. The dialog is gone.

## 3 Consequences

- One control reads the same on the ticket and the position, in all three languages, and on a phone it spans the panel under Close.
- Letting go, not each step, calls the desk, so a drag is one request.
- `test/tips.test.ts` checks the toggles, thumbs and fills are in the position's panel but not its table, that no dialog or chip remains, and that English never writes the lowercase names.
- A browser check turned a Stop Loss on and off from its toggle, and dragged the Take Profit thumb to 30%: the desk's price read back at 30% away, and the thumb and label stayed there.
