# ADR 0069: Round Selection Beside the Quote

Status: accepted, 1 November 2026. Changes the controls in [ADR 0064](0064-thirteen-plots-and-a-lobby-that-chooses.md).

## 1 Context

Peter asked to remove the large round picker from the chart's centre. Replay should have left and right buttons around a refresh button beside the quoted pair; Simulation should offer separate base and quote currency menus. The clock also took too much space.

## 2 Decision

Replay's previous, refresh and next controls sit beside the pair. The arrows wrap around the thirteen plots. Refresh draws a different plot at random. Their titles and dates stay hidden until the bell; the refresh tooltip gives only the current plot number.

Simulation replaces the pair label with two compact currency menus. They use the fourteen pairs the server already offers. Changing the base keeps the current quote if that pair is supported, otherwise it chooses the first supported quote. The quote menu shows only valid counterparts for that base.

Selection remains a shared lobby action. The server checks membership, phase, offered choices and the existing throttle. Controls remain visible but disabled once the countdown begins or the connection loses fresh data.

The clock uses short labels and only the width it needs: day progress such as 1/30, seconds until opening, or a short phase label. Its accessible label and tooltip keep the full description in each language.

## 3 Verification

The round tests walk Replay in both directions, including wraparound, and check that refresh changes the plot without revealing its event or date. The browser checks exercise the controls and two-player updates in all three languages at desktop and phone sizes, including selecting GBP/CHF through the two menus and disabling plot changes at Start.
