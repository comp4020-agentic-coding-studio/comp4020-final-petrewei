# ADR 0070: Numbered Replay Plots and a Centred Countdown

Status: accepted, 1 November 2026. Replaces the arrows of [ADR 0069](0069-round-selection-beside-the-quote.md) for Replay, and changes the picker of [ADR 0064](0064-thirteen-plots-and-a-lobby-that-chooses.md).

## 1 Decision

Replay uses one dropdown listing all thirteen plots, each labelled with its pair and an opaque number such as EUR/CHF · 01. A number selects exactly that plot, so two plots of one pair, such as USD/CNY's, can be told apart and chosen. Titles and dates stay hidden until the bell. Simulation keeps its separate base and quote menus.

The start countdown is a compact card centred over the chart, displaying seconds and the existing cancel action for the starter. The order ticket stays usable during the countdown.

## 2 Chart Correction

The daily-close bridge previously imposed a minimum daily movement of 0.2%. That manufactured large wicks during quiet or pegged USD/CNY and EUR/CHF periods. The bridge now scales its random variation to the actual close-to-close move, with unchanged closes held flat. Each recorded daily close remains exact. These intermediate prices are generated, not historical intraday observations.

## 3 Verification

Data checks cover unchanged closes, tiny moves and preservation of real daily closes. Browser checks cover Replay pair selection shared between visitors, the centred countdown, and the existing trading flow at desktop and phone sizes in all three languages.

## 4 Replay Is Real Data

Replay plays the European Central Bank's recorded daily rates, with the other pairs worked out from them. Every day's opening and closing tick in a plot, and in the thirty days before it, is that recorded rate; a check compares them for all thirteen plots. Only the nine ticks between two closes are generated, and the page's About text says so. Making them quieter on still days, as above, means the chart no longer shows a wick the record does not support.

## 5 Display and Space

The dropdowns are as wide as their text: three letters for a currency, seven characters for a pair. The quote shows five significant digits, for display only; the desk, the fills and the position table keep the pair's own decimals.

## 6 What Was Left Out

The previous, refresh and next buttons of [ADR 0069](0069-round-selection-beside-the-quote.md), the server's walk through the plots, and a choice by pair are gone. The server accepts only a plot's number.
