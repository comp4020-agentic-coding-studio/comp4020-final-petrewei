# ADR 0054: A Compact Lesson Card and a Helper That Waits

Status: accepted, 28 October 2026. Moves the lesson panel of [ADR 0013](0013-a-private-tutorial.md) and adds to the pointer of [ADR 0053](0053-a-pointer-that-waits-and-does-not-dim.md).

## 1 Context

Peter found that the lesson panel took too much space. It sat above the page, pushing the market down, and he wanted it to use the empty space in the chart. He also wanted the sliders to move by themselves, and the hints to act after a longer wait, with a countdown shown.

## 2 Decision

**A card in the chart.** The lesson is a card over the chart's bottom-right, inside the chart box, clear of the price scale. It shows the lesson number, the title, the task and the buttons. The explanation opens with a Why? button, and the button says whether it is open. The card is 184px tall on a desktop and 204px on a phone, against 306px with the explanation open. It stacks above a lit control and below the pointer's words, so a lit chart is never hidden by it.

**A helper that waits 10 seconds.** When a step has been lit for 10 seconds with no input, the page does the step for the player: it slides the slider, or presses the button. Peter chose ten seconds, and chose doing the step including the press. The countdown sits in the pointer's words, "Doing it for you in 9s". Any click, key or slider move starts it again. It stops while the tab is hidden, while a dialog is open, and while a slider is sliding. A press goes through the same server rules as the player's own: Buy opens a real practice position and Close closes it.

**Sliders that slide.** The helper moves a slider over about 0.4 seconds, firing the same input events as a hand, or jumps at once for a player who prefers reduced motion. Leverage and Stake follow the ladder they snap to.

## 3 Consequences

- The page starts at the market again, and the tutorial's explanation is one tap away.
- A player who waits is taught by example, and one who does nothing still reaches the last lesson. The helper places trades and closes positions for them, on their private practice market.
- The card can cover price action in later lessons, where the chart's bottom-right corner holds more of it. I measured 0% ink there in lessons 1–2 and 11–15% in the later ones.
- `test/tutorial.test.ts` checks that the helper's move for every press in all twelve lessons is accepted by the real tutorial. `test/tips.test.ts` checks the card's place, the stacking, the Why? button in all languages, and the countdown and its pauses.
- A browser check showed the card inside the chart box at 1280px and 390px wide, the countdown going 10 to 1 and starting again, Why? opening and closing the explanation, and lessons 1 and 2 finishing without input. Japanese and Chinese were not looked at in a browser.
- The hint's placement does not yet avoid the card, so on a phone the words can sit over its top edge.
