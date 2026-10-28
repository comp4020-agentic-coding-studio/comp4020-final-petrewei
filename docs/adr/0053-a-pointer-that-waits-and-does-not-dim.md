# ADR 0053: A Pointer That Waits and Does Not Dim

Status: accepted, 28 October 2026. Changes three things in [ADR 0052](0052-a-tutorial-that-points.md): the dimming, the timer, and where the pointer stays.

## 1 Context

Peter used the tutorial and reported three things: the tutorial's tips stayed on screen when he switched to another mode; the steps that only ask him to look took a long time, and he wanted a click or a key to move on; and he did not want the page dimmed.

## 2 Decision

**It goes with the tutorial.** The pointer, its ring and its words, belonged to the tutorial but was cleared only when a tutorial's state arrived, and only a tutorial's state has a lesson. Replay and Simulation never sent one, so nothing cleared it. It is now cleared when a state without a lesson is shown, and at once when the tab is switched. Going back to the tutorial puts it back at the step it was left on.

**It waits for the player.** The timer that lit the next step after 3.5 seconds is gone, since a pointer that moves on by itself is another thing to wait for, and with a way to move on at will it has no use. A step to look at stays until the player moves on, by a click anywhere, or Enter, Space or the right arrow, or by doing the next thing. The click is not taken: it carries on to whatever it landed on, so pressing Buy still buys. A key typed on a slider, a button, a link or a field is left alone, where the same keys do something else, and nothing moves while the name box or any dialog is open. A key never takes the action a lesson teaches: on the last step, the Next button, Space does nothing and the player presses it.

**It does not dim.** The page keeps its colours. The control is ringed in solid pink with a pale halo, and its words sit beside it, and nothing else changes. Peter chose the dimming in ADR 0052 as the more specific; he now prefers the page as it is.

## 3 Consequences

- Another mode is free of the tutorial's pointer, in the state and at the tab.
- A player who reads fast is not held, and one who reads slowly is not hurried.
- A look step needs one input from the player, where it needed none, and a step the player forgets stays lit.
- `test/tips.test.ts` checks that the ring has no shadow spread and the page no dimming class, that the pointer is cleared by a state without a lesson and by the tab switch, that no timer remains, that a click and a key call the step on without cancelling the click, and that typed keys are left alone.
- A browser check showed the pointer gone 50ms after a switch to Replay and to Simulation and back at its step on return; the same chart still lit after more than the old 3.5 seconds; Enter and the right arrow moving it on; a click on the slider setting Leverage and moving on; and a key or click doing nothing while the name box was open.
- The slider snapping to its ladder, so that one arrow key does not move it, is as before.
