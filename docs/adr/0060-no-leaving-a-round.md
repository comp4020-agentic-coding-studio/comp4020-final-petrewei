# ADR 0060: No Leaving a Round

Status: accepted, 29 October 2026. Removes the leave of [ADR 0022](0022-a-rounds-controls.md) and the round-info button of [ADR 0039](0039-a-tidier-page.md).

## 1 Context

Peter found the Leave button useless, and asked for it and its function to go, and for the round-info button on the chart's quote line to go too.

## 2 Decision

**Leave is removed, not hidden.** The action, the desk's `leave` rule, the market's method, the button, its confirmation, and every word for them in all three languages are gone: the tip, the tag a person wore in the room and at the bell, the line telling them they had left, the feed line, and three refusals. The room and the bell have one fewer state, so a row is a bot, a person, or someone wiped out. A page that still sends `leave` is turned away as an unknown action and changes nothing.

**The ⓘ goes with it.** The round-info button explained Pause and Leave together. Pause and End still carry their own hover tips, so the explanation went, with its three translations.

**What stays.** Pause, and End for whoever pressed Start, are in the quote line as before. Ending a round, cancelling a countdown and closing the bell are unchanged.

## 3 Consequences

- A player cannot walk away from a round with their money intact: a loss has to be played out, or ended for everyone by the starter, which suits a game about not walking away.
- The About page no longer says a player can leave a round.
- `test/rounds.test.ts` fails if an action called `leave` is accepted, checked by putting one back and seeing it go red. `test/tips.test.ts` fails if the button, the ⓘ or any of their words return.
- A browser check at 1280 and 390 pixels, in English and Japanese, showed the quote line with only Pause and End and no ⓘ, and no sideways scroll.
- ADR 0022 and ADR 0039 still describe Leave as it was, with a note at the top; their history is kept.
