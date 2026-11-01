# ADR 0072: The Tutorial Plays Like a Disc

Status: accepted, 2 November 2026. Replaces the tutorial's controls and the tick tooltips of [ADR 0071](0071-explicit-tutorial-controls-and-short-tick-labels.md), the keys of [ADR 0053](0053-a-pointer-that-waits-and-does-not-dim.md), and the lesson card of [ADR 0059](0059-a-card-that-always-reads-and-a-ladder-with-even-rungs.md).

## 1 Context

Peter found the lesson controls bad: Restart did not stop the lesson and wait, Start and Pause looked alike and overlapped in what they did, the card's words were not kept to the left, the back and skip keys were coloured emoji, and nothing could be done from the keyboard. He asked that it behave like the controls of a CD player or a television. The cause was that three things all meant "started" and could disagree: a flag in the page, another in the page, and a third on the server, kept in step by hand.

## 2 Decision

**One state, kept on the server.** The tutorial is stopped, playing or paused. It rests stopped at lesson 1 until Play. Pause holds it where it is, with the price still and the hint's seconds held on screen, and Play carries on. Stop goes back to lesson 1 and waits. Every move, skip and step of the price is refused unless it is playing, with a message in all three languages. A page that reloads, or a second tab, can only agree with the server.

**Four keys, as on a remote.** Previous, Play and Pause as one key that changes shape, Next, and Stop. Previous works as it does on a disc: once starts this lesson over, and twice within two seconds goes to the lesson before, which gives back the "start this lesson again" the old card had without another button. They are drawn shapes in the page's colours, never emoji. Play is the one filled key, so it is the one that is found.

**The keyboard.** Space plays and pauses, the left and right arrows go back and skip, and Escape stops. A key typed in a field, or on a control that uses it, is left to that control, and so is any key while a dialog is open. Space and the right arrow used to move a step to look at along, with Enter; they are the transport's now, so Enter and a click move a look on, and each key has one meaning.

**The card.** The lesson's number, title and text are one block at the left, and the keys and the task are the block at the right.

**Tick tooltips.** Each tick of leverage, stake, Stop Loss and Take Profit carries a line of its own on hover, in the game's voice, in all three languages: "Dad must never know" at 300×, "Panics at a sneeze" for a 1% Stop Loss. They no longer restate the holding cost, which the ticket shows once. A check holds the lines to the desk's own lists, so a rung added without a joke is caught, and no two ticks share a line.

**Holding cost.** The time-based charge is called holding cost, and not margin interest. Real brokers call it swap or rollover and quote it a day; ours is charged each tick and grows with the square of the leverage, so a name from real finance would mislead.

## 3 The header

The market and About share one header part, with slots for the tabs and the name that only the market fills. About used to be made by cutting the market's header out of its text and deleting two pieces, so an edit to that header could break About without a sign. Who you are now sits beside the tabs in the space that is left and is cut with an ellipsis, so the header is two rows tall at 901 to 1279 pixels and one above, and never three. That was the tall header seen at 125% zoom. The page-building code moved to `src/pages.ts`, so the checks build a page the same way the server does.

## 4 Verification

Unit checks cover the transport in the engine, the lines for every tick, and every string in three languages. A browser check, in all three languages, opens the tutorial stopped, plays, pauses, checks that the countdown is held, and drives the keys; another measures the header at six widths with the longest name. The header check was run against the old layout and failed with its 146 pixel header. The transport check found, while being written, that the hint vanished on Pause, which was fixed; it was not run against the old card, whose buttons are not the ones it drives.

## 5 What Was Left Out

Stopped and paused look the same on the keys, as on a disc, and the task line says which. The server's `restart` and `again` actions stay for an older page. Whether the Japanese and Chinese lines read as native has not been checked.
