# ADR 0064: Thirteen Plots and a Lobby That Chooses

Status: accepted, 29 October 2026; stage two of the market changes of [ADR 0062](0062-thirty-day-rounds-and-a-chart-that-opens-full.md). Changes the replays of [ADR 0030](0030-replay-clues-and-name-that-year.md) and the lobby of [ADR 0022](0022-a-rounds-controls.md).

## 1 Context

Peter asked that Replay drop its plain windows and play at least twenty designed black-swan plots, with a random start for each, the swan landing between day 11 and day 30, and a way to switch between plots with the real day still hidden. Simulation was to let the lobby choose its currency pair, with more pairs added.

## 2 Decision

**Thirteen real plots, not twenty.** The bundled prices are the ECB's daily rates, so a plot is a real day on which one pair broke. Each candidate was measured against the data, and only those that stand out were kept: a day that moved by two or more times the next largest day in its window, or a clear multi-day fall. Thirteen survive. Five of the first ten were weak in daily data, and a script that picked each plot's turning point automatically chose a rebound, so none were left to a script. Peter chose the thirteen over padding to twenty with scripted ones.

**What the data corrected.** Lehman is the carry currency, AUD/JPY, where the yen fell hardest into the day, so the plot moved from USD/JPY, and its note now says what the data shows: about a ten percent fall in the three weeks before. The note on the euro in 2000 says "more than a quarter" and not "30%", the ECB's easing in 2015 "twelve years" and not eleven, and the yuan's step in 2005 the largest in twenty-one years of the data, each from a check. A plot of the mini-budget and one of Japan's intervention were dropped, since the fall was before the day or the move was a rebound.

**The swan lands on day 11 to 28.** A window is placed so the day falls on any of those, with ten days to read first and two after. A random start moves the calendar, and the test counts the days it lands on.

**The lobby chooses.** In Replay a button moves to the next plot, by number only: "Plot 9 of 13". In Simulation a menu takes any of fourteen pairs, six of them new, every one two of the six ECB currencies. Either redraws the round behind the lobby at once, so the chart behind shows the choice. Only someone on the tab may, only in the lobby, and the server refuses a plot or a pair it does not offer.

## 3 Consequences

- A Replay player sees the pair and a number and not what the plot is, but a pair and thirty days of history can give a famous run-up away to someone who knows it.
- The thirteen are short of the twenty asked for, and I said so before building them.
- On a phone the lobby had to move down and drop its play-money note, which the footer repeats, to clear the quote and the switches.
- A test breaks the choice in each way: a plot's title leaked into the state, and a choice accepted after the countdown began.
