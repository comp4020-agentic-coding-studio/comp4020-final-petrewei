# ADR 0074: Six More Stories

Status: accepted, 4 November 2026. Adds to [ADR 0073](0073-real-minutes-for-replay.md). Peter asked for more stories and no new currencies.

## 1 Context

Replay had thirteen stories, mostly a single shock or a broken peg. Peter wanted more, in the six currencies the game already has. The stories could only be real if HistData carried their pair and year, so the choice was made from the data and not from memory: every half hour of every downloaded file was ranked, and the biggest moves named the candidates.

## 2 Decision

**Six stories were added, from the moves the data ranked highest, in pairs the game has.**

- The mini-budget, GBP/USD, September 2022: the pound opened Sunday evening as much as 5% lower.
- The pound's flash crash, GBP/USD, October 2016: about 6% in two minutes in the Asian night.
- The new year flash crash, AUD/JPY, January 2019: about 7% against the yen in minutes, in a thin holiday market.
- Fukushima and the yen, USD/JPY, March 2011: a record high for the yen, then the G7's joint selling.
- The Bank of Japan doubles down, USD/JPY, April 2013: 3.6% in a day, a policy staircase.
- The Bank of Japan surprises, USD/JPY, December 2022: the yield band widened, the yen up about 3%.

That makes nineteen stories, seventeen of them real minutes.

**One candidate was dropped.** Japan's intervention of 22 September 2022 was built and then removed. The game already holds a test that a story's biggest move is more than three times a normal day's; every other story clears it, and this one is 1.9 times, with a window range of 3.5% and a net move of 1%. The event mattered to policy and barely moved the price, which would have been a quiet round shown as a black swan. The bar was not lowered to admit it. Ukraine's invasion and the Silicon Valley Bank failure were looked at and left out the same way: large in a day, dull in half hours.

**The notes were rewritten to what the minutes show.** The old notes quoted the ECB's daily snapshots, which differ from the minutes, and a note and the chart beside it must agree. The franc fell 13% in an hour and 19% at the day's low, not 15% and 30%; the ECB's bond buying was 2% on the day and 1% the day after, not almost 4% in a day; the Bear Stearns rescue was a fall of 1.5% and a bounce of 2.4%; the euro rescue was about 2%, not over 4%; the quant crash about 6%; Brexit about 9%; the 2008 carry trade 46% to its October low. Each figure was measured from the minute files, and each cause in the new notes was checked against reports, which corrected several first drafts: the pound's fall in September 2022 was up to 5% where the half-hour bar shows 3.7%, the January 2019 yen move was about 7% against the Australian dollar and not 3%, and the Fukushima story is a market rumour that Japan's finance ministry denied.

**The build learned three things.** A day is trading when its file has at least a hundred bars, not only when it falls on a weekday, since the turn of the year is as shut as a weekend; the January 2019 story's first two days were empty until this. A window that runs off the end of a file now stops with the story's date in the message, where before it looked for ever and the build hung. And a window near the turn of the year reads the file of the neighbouring year, which the 2019 story needed, so the 2018 file was fetched.

**The widest day is judged by range, not net move.** A flash crash is a spike that comes back, a small move over the day and a large range, so close to open misses it; the range is also what a candle shows. By range sixteen of the seventeen real plots have their widest day within one day of the middle, and fourteen are on it exactly. Lehman is the one exception: the bankruptcy was a Monday and the market was wildest a week later, so it is named in the check, and another story cannot join it unseen. A per-story window, as Peter agreed in principle, would put Lehman's bankruptcy earlier in its window.

**The server no longer dies on a missing clue.** A story added without its clue text threw inside the tick loop and killed the whole server, which showed as ninety failures in a test run. The tick now skips a clue the table lacks. A round on a story with no clues was shown to reach its bell with the server alive, but there is no permanent check of that: a test would need a switch in the application only for the test, or would pass either way. What holds the text to its stories is the translation check, which fails for a story with no clues.

## 3 What Was Not Checked

The six causes and figures were checked against reports in this session, but the clues were written from general knowledge and not sourced, and the pound flash clue, about a hard line on leaving, is the weakest. The Japanese and Chinese text is not native-reviewed. The notes' claim that about half of the January 2019 move reversed within the hour is true against the US dollar and was not checked against the Australian dollar and the yen.

## 4 What Is Still To Do

[ADR 0075](0075-a-shorter-finer-clock.md) makes the game play these stories from `data/minutes.csv`.
