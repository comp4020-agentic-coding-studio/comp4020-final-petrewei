# ADR 0052: A Tutorial That Points

Status: accepted, 28 October 2026; its dimming, its 3.5-second timer and where its pointer stayed changed by [ADR 0053](0053-a-pointer-that-waits-and-does-not-dim.md). Refines the tutorial of [ADR 0013](0013-a-private-tutorial.md) and the stop lesson of [ADR 0037](0037-sliders-on-the-position.md).

## 1 Context

Peter asked for the tutorial to be improved and refined, for example with a more specific highlight. A lesson lit a whole block, the Leverage label, slider and scale, or the whole Stop Loss and Take Profit control, in an outline that was amber and faded to nothing half of every second, and on the light theme was brown on pastel. A task such as Set Leverage to 1×, then press Buy lit both at once. The card that carries the task was cut off, the longest English task needing three lines in a box of two. Peter chose a spotlight, steps within a lesson, tighter words and a card that is not cut off.

## 2 Decision

**A plan of steps.** Each lesson carries a plan, an ordered list of steps, each naming the exact element to light, what finishes it, and the words for it in all three languages. A step is to look at something, to set a slider to a value the page can check, such as leverage=30, or to press the control that takes the lesson's action, which every lesson has exactly once. Sliders come before the press, and only looking comes after it. The page lights the first step not yet met; a slider already at the right value is passed over, so a beginner who has the settings is not made to redo them. A step that only looks stayed lit for 3.5 seconds and then the next was lit, which Peter chose over a click or showing them all at once, and then found too slow (ADR 0053 has it wait for a click or a key instead); the choosing is a small pure module, `public/plan.js`, shared with the checks.

**A spotlight.** The one control a step names is ringed in the brand pink with a halo, and everything else was dimmed by the shadow around it, not an overlay, so the control stayed clickable; ADR 0053 took the dimming out. The ring pulses in width and never fades. Its words sit beside it, numbered when there are several steps, on the side of the control where they cover least: a button or slider counts most, a figure or label less, a heading least. A control as wide as the chart gets its words inside it. A control below the fold is scrolled into view once per step, and the words are placed again as the page settles.

**Exact targets.** The Leverage slider alone, 309 by 22px and not a 309 by 64 block; the one Buy or Sell button; the Open P&L figure; the Stop Loss thumb. A step whose control is not on screen yet, such as Close before there is a position, is passed over and not dimmed to.

**The card.** The task box has a floor of three lines and grows, and is never cut off. The lesson's buttons ask for their tip below them, so a tip no longer lands on the task.

**Words.** The twelve lessons and their tasks were tightened, with the terms named as the page names them, Stop Loss, Margin Level, Net Worth, and each step written in Japanese and Chinese in its own voice, with the buttons' real labels.

## 3 Found along the way

- The first version of the stepping never moved past a step that only looks, since nothing the page could see met it, so in the Taking Profit lesson the Open P&L stayed lit and the Close button, the control the lesson is about, never was. A survey of the first lit control in each lesson did not show it; watching the lit control over time did.
- The stop lesson accepted a Stop Loss of any size, a 50% stop included, which then taught nothing against its 1.7% fall. It now accepts 1% to 1.5% and names the stop chosen, in all three languages.
- That lesson's directions pointed to the left end of the thumb, but 1% is next to the middle line and the left end is 50%: the first version sent a beginner to the worst answer. Its words are tested against the track's own geometry.
- The tutorial never showed the Borrow button its Dad's Savings lesson asks you to press, since it waited for a trading phase the tutorial lacks.
- Every feed line with a signed amount showed {pnl+}, in every language, since the first translation: the pattern that fills a template did not match a plus. A test now fills every line.
- A figure whose class the page rewrites each tick lost its ring half a second after it was lit, and one that clips its own overflow cut the ring off; neither may now.
- A duplicate name in the page script, `shown`, stopped the whole page loading. The existing check that parses every script catches that, but it had not been run: the changes up to then were tested with the tutorial, translation and tip tests alone, and a browser run found the blank page first.

## 4 Consequences

- A beginner is told one thing to do at a time, at the control that does it.
- `test/tutorial.test.ts` holds each plan to its model, its targets and the leverage each lesson is checked against, the stop lesson's range and its directions; `test/i18n.test.ts` that every step has words in every language and that no feed line keeps a placeholder; `test/tips.test.ts` that the spotlight runs after the page has been laid out, that no lit control's class is overwritten, and that Borrow shows in the tutorial.
- A step that is a slider already at its value is passed, so the lessons that ask for 30× begin at Buy when the page already reads 30×, as it does by default; the beginner does not meet the slider there.
- The leverage slider snaps to the ladder, so one arrow key does not move it; a keyboard user crosses a rung by holding the key, which this change does not address.
- Pressing Borrow in the lesson lends the money and moves straight on to the last lesson, with no pause to see it arrive.
