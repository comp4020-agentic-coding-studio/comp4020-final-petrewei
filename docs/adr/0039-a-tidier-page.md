# ADR 0039: A Tidier Page

Status: accepted, 27 October 2026. Moves the round controls of [ADR 0022](0022-a-rounds-controls.md) and [ADR 0024](0024-pause-ironman-and-a-trading-ticket.md), and the language picker of [ADR 0016](0016-the-address-names-the-language.md).

## 1 Context

Peter asked for several changes to the page's layout at once: pause, leave and end beside the price; Ironman beside Start; a single line of lobby text with a disclaimer under it; a footer as wide as the page; a header on the ticket and panels that fold; and a language picker that no longer pushes his name out of place.

## 2 Decision

**Round controls in the quote line.** Pause, leave and end for all are three small icon buttons between the price and the clock, each named by its tip and its label. They show only when they apply: pause in a trading round that is not ironman, leave while a round runs, end for the one who pressed Start. They left the ticket, which is shorter for it.

**Lobby.** Ironman sits at the right of Start. The text is one line in each language and each mode, short enough to fit in 360px without being cut off, and a line of small print sits at the foot of the lobby: play money only, and real trading can lose everything put in. The print is hidden once the countdown starts.

**Footer.** It takes the page's full width, as its text did not need a limit.

**Ticket header and folding.** The ticket has a heading like the others. The ticket, room, feed and hall of fame fold to their headings, by click or Enter, and the choice is kept in the browser. The tutorial keeps every panel open so no control is hidden from a lesson.

**Language.** The picker is a globe alone, the same size as the other tool icons: the real selector sits invisibly over it, so the browser's own menu, keyboard and screen reader work as before. The name box has the same.

## 3 Consequences

- The header row has room for the name at a middle width, where the wide selector had pushed it.
- A phone's quote line holds the price, three buttons and the clock without cutting any; a check found the end button off the card edge first.
- `test/tips.test.ts` checks the order of the quote line, Ironman beside Start, the three lobby paragraphs, the ticket's heading, the panels that fold, the globe, the footer rule and that each language's lobby text and print are present and short.
- A browser check measured the lobby line on one line in all three languages and both modes at 360px, folded and reopened the ticket, and watched the controls change with the round's phase.
