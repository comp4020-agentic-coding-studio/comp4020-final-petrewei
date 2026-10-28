# ADR 0055: Five Seconds, Pause and End

Status: accepted, 28 October 2026. Changes the wait and the countdown of [ADR 0054](0054-a-compact-lesson-card-and-a-helper-that-waits.md).

## 1 Context

Peter used the helper and asked for three things: the countdown to say only the seconds, the wait to be 5 seconds, and a way to pause the hints and a way to end the tutorial.

## 2 Decision

**Bare seconds, after 5.** The countdown reads "4s" after the step's words, "4秒" in Japanese and Chinese, and starts from 5. The "Doing it for you" wording is gone from all three languages.

**Pause hints.** A symbol button, ⏸, in the card's top row stops the countdown and the helper. The lit control and its words stay, so the player can read in peace. It becomes ▶ to resume, and its label and tip say what it does, in each language. Resuming starts the countdown afresh. The pause lasts across steps and lessons until it is pressed again.

**End tutorial.** A ⏹ button beside it leaves the tutorial and goes to Replay, where the card and the pointer are gone. Start again, which starts the lesson over, stays. Peter asked for symbols in place of a second row of words, which keeps the card at 186px.

**The card's buttons are not page clicks.** Pressing Pause also moved a step to look at on, as any click does (ADR 0053). Clicks on the lesson card no longer do that.

## 3 Consequences

- A player who wants the helper off can turn it off, and one who has had enough can leave without switching tabs.
- Five seconds leaves less time to read a step before the page acts, which Peter chose; the pause is the way to slow it.
- `test/tips.test.ts` checks the 5, the bare seconds in all languages, the new labels and tips, that both buttons show a symbol and no letters, that a paused state arms no timer and shows no count, that End goes to Replay, and that a card click does not advance a step.
- A browser check showed the count going 4, 3, 2, a pause holding for seven seconds with the count gone and the lesson unchanged, Resume restarting at 5s, the helper moving lesson 1 on by itself, and End returning to Replay with the card and pointer hidden.
- The pause is not remembered across a reload, and Japanese and Chinese were not looked at in a browser for the new buttons.
