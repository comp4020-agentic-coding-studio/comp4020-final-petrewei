# ADR 0045: Two Candles for the Favicon

Status: accepted, 28 October 2026. Replaces the favicon of [ADR 0043](0043-a-candlestick-icon-and-a-subtitle-at-the-side.md).

## 1 Context

Peter found the candlesticks-and-coin favicon of ADR 0043 not good, and pointed to the fan site of the comic, whose icon is two bold candlesticks, one red and one blue, with nothing behind them. He asked for the same: no coloured background, only coloured candlesticks, one up and one down, in the colours of this site, with a currency mark only if space is left.

## 2 Decision

The favicon is two candlesticks on a clear background: a green one, up, and a red one, down, in the site's own up and down colours, the green one higher and the red one dropping below it so the pair reads as a rise and a fall. Their wicks and bodies are bold, with rounded bodies, for 16 pixels.

There is no currency mark. It was tried, a yen above the candles, and at 110 pixels it is a nice touch, but at 32 it is a speck and at 16 it is gone, and it makes the candles smaller; a tab icon is mostly 16, so the candles keep the room. The reference icon was fetched and looked at, not copied: it is another site's drawing, and ours is a new one in our own colours.

## 3 Consequences

- The tab shows two candles, readable on a light or a dark browser theme.
- `test/tips.test.ts` checks that the icon has two bodies, one in the page's up colour and one in its down colour, the up one higher, and no tile, line graph, coin or text.
- A browser check drew three candidates at 110, 32 and 16 pixels on white and on dark, and chose the one where the green candle sits above the red; the first draft, with the red higher, read as the red one rising.
