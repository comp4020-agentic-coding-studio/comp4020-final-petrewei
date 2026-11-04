# ADR 0077: The Account in the Stake, and a Leaner Card

Status: accepted, 4 November 2026. Builds on [ADR 0076](0076-one-screen-and-a-whole-account-stake.md) and reverses its dropping of Sell's and Buy's notes. Peter asked whether the stake and the account should fuse, agreed to the account drawn in the stake's track, and then asked for the card to be leaner in six ways.

## 1 Context

Since a stake is a share of net worth, the stake and the account measure the same money, but the slider showed neither what was already in use nor that an order past what was free would be cut. Moving the slider into the account was rejected: it would split the order's steps, sit idle when the bell takes the ticket's place, and mix two meanings on the account's bar, which measures net worth against the start.

## 2 Decision

**The stake's track is the whole account.** It runs from nothing at the left to all of net worth at the right: the margin in use is striped at its left, then what this order would add in the stake's colour. The slider lies over the track's 25% to 100%, so its thumb and marks stand on the shares they mean. When the order would be less than the stake asked for, because no more is free, the stake's value turns amber, and the preview names the amount the order would really put in. `stakeBar` in `public/ticket.js` works the parts out, beside `stakeMargin`, and is tested.

**The card is leaner, at Peter's direction.**

- The spread is the ticket heading's note, at its right, not a row.
- The account has no title inside the card: its figures name themselves, and a line divides it from the ticket. A fold this browser remembers from a narrower window does not apply there, since there is no heading to unfold it with.
- Every ⓘ explanation opens with the name of what it explains ("Leverage: …"), in every language, and a check holds it.
- The preview drops "Puts in" and runs its two phrases on one line, joined by a dot, wrapping only at the dot.
- The margin key's line is gone: its ⓘ sits at the end of the account's bar, the bar's marks name their levels ("call 50%", "cut 20%"), and the ⓘ states both levels for when no position is open. A mark near an end hangs its words inward, and when the call and the cut sit close, the cut's words drop a line.
- Sell's and Buy's notes stay at every size: they say which way each one wins.

## 3 Result

The card is 524px at 1536 by 730, where it was 599px, and 503px to 520px at 1366 by 657 in each language, with the notes back. It fits whole down to 1366 by 768.

## 4 What Was Not Checked

The 75% to 100% case of the bar against a position opened in profit was checked at the yen; very large losses, where margin in use exceeds net worth, were checked in the function and not on screen.
