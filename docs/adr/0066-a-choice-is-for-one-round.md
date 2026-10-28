# ADR 0066: A Choice Is for One Round

Status: accepted, 29 October 2026. Follows a second review for simplicity, efficiency and altitude of the changes of [ADR 0064](0064-thirteen-plots-and-a-lobby-that-chooses.md) and [ADR 0065](0065-prayers-six-distances-faces-and-news.md); amends both.

## 1 Context

The same four-way review that [ADR 0063](0063-the-page-keeps-no-copy-of-the-desk.md) describes was run on the market changes. Two of the four reviews did not finish, since the key's spending limit was reached, so the reuse and simplification reviews are missing. The efficiency and altitude reviews found three things worth acting on, and one of them was a fault in the design, not a tidy-up.

## 2 Decision

**A choice lasts one round.** The lobby's choice of plot or pair was kept after the round began, so after one press of "next plot" every later Replay round replayed that plot, and the only way on was to press again. It is cleared when the round starts, and a cancelled countdown keeps it. This is a fault in what was built, found by the altitude review and not by any check.

**One person cannot flood the room with it.** Each choice draws a new round and sends everyone the whole state, with no limit. A person may now choose once in a quarter of a second, a choice of what is already on show draws nothing, and the refusal is translated in all three languages. Tests set the limit to nothing, since they press thirteen times in a row.

**Smaller things taken.**

- The chart's marks read two colours and set a font once for each mark. They are read once, and the font is put back to its usual size afterwards: before, the price tag was drawn in the marks' smaller type whenever a mark was on the chart, which no check could see and a browser did.
- A mark is pushed on the list, and the oldest dropped, and not a copy of all of it for each fill.
- The broker's numbers a page is told, and the list of plots, are built once and not for each viewer each tick.
- The setting `EVENT_CHANCE`, which chose how often a replay hid a famous day, was dead since the plain windows went, and is gone.
- The words of the twelve stories are checked for the right number in each language and in the order the numbers expect, and none may say what the price will do. A first version also forbade the word "rumour", but a story about a rumour is a fair hint, so only the prediction is forbidden.

## 3 What was not done

- **`pick` means a plot in Replay and a pair in Simulation.** Two meanings in one field, and a stricter type would be tidier. With two modes it would add structure the code does not need yet.
- **The marks, the history and the broker's numbers are serialised for each viewer each tick.** Sending only what is new, as the prices already are, is the right fix, and a larger protocol change than a cleanup. It costs nothing a room of this size feels.
- **Nine ladders are passed to the chart's functions by hand.** A factory would remove the repetition, at the price of changing every call.

## 4 Consequences

- A player can go back to random by starting the round, and no choice outlives it.
- A test breaks the clearing by never clearing it: all later rounds stay on the chosen pair, and it goes red.
- The test of this takes two seconds: a first version that played seven rounds took fifty-five, and ended each by waiting.
