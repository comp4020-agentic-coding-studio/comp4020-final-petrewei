# ADR 0070: Replay Pairs and a Centred Countdown

Status: accepted, 1 November 2026. Replaces the arrows of [ADR 0069](0069-round-selection-beside-the-quote.md) for Replay, and changes the picker of [ADR 0064](0064-thirteen-plots-and-a-lobby-that-chooses.md).

## 1 Decision

Replay uses one dropdown containing its available currency pairs. Choosing a pair draws one of that pair's plots on the server, at random, so a pair with several plots is not always the same one; titles and dates remain hidden until the bell. Simulation retains its separate base and quote menus.

The start countdown is a compact card centred over the chart, displaying seconds and the existing cancel action for the starter. The order ticket stays usable during the countdown.

## 2 Chart Correction

The daily-close bridge previously imposed a minimum daily movement of 0.2%. That manufactured large wicks during quiet or pegged USD/CNY and EUR/CHF periods. The bridge now scales its random variation to the actual close-to-close move, with unchanged closes held flat. Each recorded daily close remains exact. These intermediate prices are generated, not historical intraday observations.

## 3 Verification

Data checks cover unchanged closes, tiny moves and preservation of real daily closes. Browser checks cover Replay pair selection shared between visitors, the centred countdown, and the existing trading flow at desktop and phone sizes in all three languages.

## 4 Replay Is Real Data

Replay plays the European Central Bank's recorded daily rates, with the other pairs worked out from them. Every day's opening and closing tick in a plot, and in the thirty days before it, is that recorded rate; a check compares them for all thirteen plots. Only the nine ticks between two closes are generated, and the page's About text says so. Making them quieter on still days, as above, means the chart no longer shows a wick the record does not support.

## 5 What Was Left Out

The previous, refresh and next buttons of ADR 0069 and the plot's number are gone, with their strings and the server's walk through the plots. A pair with more than one plot cannot be told apart in the menu; that keeps the plots' dates hidden, which is the point of the game.
