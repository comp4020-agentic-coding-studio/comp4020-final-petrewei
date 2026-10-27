# ADR 0043: A Candlestick Icon and a Subtitle at the Side

Status: accepted, 28 October 2026. Replaces the stacked subtitle of [ADR 0041](0041-a-stacked-subtitle.md); the chart's folding of [ADR 0042](0042-headed-and-foldable-chart-and-position.md) is extended.

## 1 Context

Peter asked for three things: the chart to fold with its quote line, not leave the price showing; the subtitle on a phone to sit to the right of the logo, not under it; and a favicon of candlesticks and a currency mark in place of the line graph, to be more obvious and recognisable.

## 2 Decision

**The whole chart folds.** A folded chart is its heading alone, like the other panels, and the price line goes with it. ADR 0042 had kept that line so that pause, leave and end stayed in reach; Peter judged the heading enough. A round's controls come back with the chart.

**Subtitle at the side.** On a narrow screen the subtitle sits at the logo's right, small, in one row with who you are and the tools. Measured at 360px it has no room: with the logo, the name and four buttons on a row, it shows as nothing, and from about 390px as a few letters. Peter chose to hide it under 420px, the logo alone, and to show it, cut with an ellipsis where it is short of room, from there up; the name always shows in full. The logos are smaller on a phone so the logo itself is never cut.

**Favicon.** Three candlesticks, two white and a dark one between them, rise on the pink tile under a white coin with a yen sign. The line graph is gone: at 16px a line is a squiggle, and a candle and a coin say a market and money.

## 3 Consequences

- A folded chart is one heading, as short as the others; the price and the round's buttons are hidden with it until it opens.
- At 360px the header is the logo, the name and the tools in one row, and the name shows in full in English, Japanese and Chinese, even at 320px.
- On a phone the page does not show the game's full title above the fold; the page title and the About page do.
- `test/tips.test.ts` checks that the chart's price line has no fold rule of its own, that the narrow header and the 420px rule are as set out, and that the favicon is candles and a coin, not a line.
- A browser check measured the logo, subtitle and name at 320 to 520px in all three languages. Its first try left the brand column unbounded, so the subtitle pushed the tools off the page, and the second fixed that but gave the subtitle no room, which is why the question was put to Peter.
