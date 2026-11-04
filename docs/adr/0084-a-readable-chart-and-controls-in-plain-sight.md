# ADR 0084: A Readable Chart, and Controls in Plain Sight

Status: accepted, 5 November 2026. Changes where [ADR 0082](0082-achievements-awarded-by-the-server.md) and [ADR 0083](0083-settings-a-picture-of-the-round-and-a-candles-reading.md) put achievements and settings, and the ticket of [ADR 0079](0079-a-pending-order-at-a-typed-price-and-a-position-in-view.md). Peter could not see the chart in Replay and Simulation, nor find the credit, music or settings.

## 1 Decision

**The chart is at least 420px tall outside the desktop layout.** Between a phone's width and the desktop layout's, which needs 1100 by 600, the chart kept its 900:380 shape, so a narrow column gave it about 260px, and the RSI's pane took 84 of those. The desktop layout still fills its panel.

**Controls are named where they are.** Settings is a button with its word, not a lone gear, and holds sound, a calm screen, music and the theme. Emergency credit is a titled block in the account, with what is owed, its daily rate and the two steps, amber while anything is owed; on a short screen it fits one line, its button showing the step alone while its name still says it borrows.

**Achievements live with the hall of fame.** They are a strip under it, the same checklist as before, and the header has no medal. An achievement alone, such as drawing credit, no longer puts a person in the hall, which lists only who has finished a round or been cut out.

**The ticket reads in order.** The stake comes before the leverage, its note in the leverage note's small plain form, and each exit's switch stacks its name and distance under it. At 1366 by 657 the card still scrolls about 70px within itself, which keeps a position row in view under it, as ADR 0079 chose.
