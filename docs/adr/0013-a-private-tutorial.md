# ADR 0013: A Private Tutorial

Status: accepted, 15 October 2026; its lessons now point at one control at a time, by [ADR 0052](0052-a-tutorial-that-points.md).

## 1 Context

The markets assume a player knows what buying, selling, leverage and a margin call are. A classmate who has never traded meets eight traders, a moving chart and a 1000× leverage menu at once, and the parody's jokes land only for those who know what is being mocked. Peter asked for a single-player tutorial mode for beginners, with clear guidance and explanation.

## 2 Options

- **A help page** of text, read before playing: cheap, and easy to skip.
- **Hints in the live markets:** explanations beside a market that keeps moving and has other people in it.
- **A private scripted market:** a third tab where one player works through lessons on a price that moves only when a lesson needs it.

## 3 Decision

The agent proposed the private scripted market; Peter accepted it. `src/tutorial.ts` holds twelve lessons, each with an explanation, one task, the move it accepts, and a price path played after that move: buying and taking a profit, selling short, leverage and a margin call, cutting a loss, a stop-loss, a gap that jumps the stop as on 15 January 2015, and Dad's savings. The server refuses any other move with a hint, and the page highlights the controls the lesson names. The tutorial uses the real desk and its rules.

## 4 Consequences

- Each visitor's tutorial is theirs alone: nobody else sees it, and it never reaches the hall of fame or the shared markets.
- It lives in memory, so a restart starts it over; one unused for an hour is dropped, so the map cannot grow without limit.
- The lessons make claims about numbers, such as "a fall of about 2% costs around half your money", so a scripted playthrough printed each lesson's results to check the text, and `test/tutorial.test.ts` plays it through.
- `spec/tutorial.test.ts` checks that lessons are enforced and private; it changes only the visitor's own practice account, so it runs against the live app too.
