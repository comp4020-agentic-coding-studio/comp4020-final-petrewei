# ADR 0073: Real Minutes for Replay

Status: accepted, 4 November 2026. The first part of a shorter, finer Replay; the window, the clock and the chart follow. Changes the real-data rule of [ADR 0070](0070-replay-pairs-and-a-centred-countdown.md).

## 1 Context

Peter found thirty days, and thirty more before them, too long for a market that breaks in a day, and wanted finer ticks so a player feels the market. Replay played the ECB's daily closes with a generated walk between them, so anything finer than a day was invented. He asked for real data first, then an assumption of permission for an educational project, then simulation as real as possible.

## 2 Decision

**Real minute bars from HistData.** HistData (histdata.com) offers free one-minute bars for most pairs from 2000: open, high, low and close on the bid, in New York standard time with no daylight saving, one zip a year. It covers eleven of the thirteen plots' pairs. The raw files stay in `raw/`, which git ignores, and `scripts/build-minutes.ts` cuts the plots' days out of them into `data/minutes.csv`, a file of about 3,000 rows that the game ships.

**On the licence, Peter's decision.** HistData states no terms of use on the pages I read, and says only that the data comes with no warranty. Silence is not permission. Dukascopy, the other free source, forbids redistribution and building a database in its terms, so it is not used, and TrueFX limits its free data to internal use. Peter decided to proceed on the assumption that an educational project, used in Australia, is acceptable. That is his decision about a risk I could not remove, and the About page credits HistData. If HistData or anyone asks for the data to come out, the file and the build script go and the plots fall back to the ECB's closes.

**What the minutes are cut into.** Each plot is six FX days of 48 half-hour ticks: the day before, and five that are played, so the day the market broke is the third played day. A day is an FX day, from 17:00 the evening before, as the files' clock runs. A tick is the close of the last bar at or before its end, and a half hour with no bar carries the price before it, since a quiet minute had no trade. Half an hour was chosen by measurement: a real gap is half of its day's range in one tick at one, five, fifteen, thirty or sixty minutes alike, so the size does not change the black swan, but at one minute three ticks in four barely move, a flat line, against three in ten at half an hour.

**The ECB rule, narrowed.** ADR 0070 held that every day's open and close is the ECB's recorded rate. The ECB's rate is a snapshot at 14:15 Central European time and a bar is the bid at the end of the minute, so the Swiss franc's real day ends at 0.993 where the ECB's is 1.028. For a plot with real minutes the minutes are the record and the ECB rule does not apply. For a plot without, it does.

**The day the plot names.** A plot's date is the day the ECB's rate first shows the event, which the minutes sometimes put a day either side: the euro began falling the day the ECB announced its bond buying, and the Bear Stearns rescue was a fall and a bigger bounce. So the named day is the third played day and the largest swing of a whole day is within one day of it, which holds for all eleven. The notes' figures, such as 3.7% for the ECB's bond buying, are the ECB's snapshots over a day or two and differ from the minutes, where it is 2.2% on the first day and 1.2% on the second. The notes have not yet been compared with the minutes and brought in line; that is still to do.

**The two yuan plots stay simulated.** HistData has no USD/CNY. The RBA publishes the renminbi, but a rate a day against the Australian dollar. The CFETS reference rate began on 24 August 2015, thirteen days after the devaluation, and says nothing on reuse. The yuan plots, 2005 and 2015, keep the ECB's daily closes with the bridge between them reshaped, and the page says they are simulated.

## 3 Verification

Eleven plots are built from the nine files downloaded and the franc's, each six days of 48 ticks. Checks cut a small file written in the test, so they run anywhere, hold the placement, and compare the shipped file with the raw bars tick for tick where those are on the machine. Breaking the build a day late fails two checks.

## 4 What Was Left Out

The game does not read `data/minutes.csv` yet, and the page, the clock, the indicators and Simulation are unchanged. The text the players read has not yet been brought in line with the minutes, nor has the credit for HistData.
