# ADR 0008: Rounds with a Prompt

Status: accepted, 15 October 2026.

## 1 Context

After crit 9 Peter judged the fridge too low on playability and competitiveness. A review of the course's crit 8 hall-of-fame projects found what the strongest share: other people are necessary to play, one rule forces real trade-offs, and short rounds end in a visible result. The fridge had shared scarce words and live updates, but no goal, no rounds and no score, so taking a word cost its owner a line but gave the taker nothing.

## 2 Options

- **Standing lines.** A line scores while it stands; taking a word stops it.
- **A prompt race.** Each round sets a checkable challenge, and the first line to meet it wins.
- **Both, combined.** Rounds open with a prompt; standing lines score, doubled if they answer it.
- **A new game altogether**, abandoning the fridge and three crits of process.

## 3 Decision

Peter chose to combine them. A round lasts three minutes and opens with a prompt the server can check from a line's words alone, such as "a line with a colour in it" or "a line of five words or more". While a line of three or more words stands, its owner earns a point per word per second, doubled if it answers the prompt. A line's owner is whoever placed most of its words, and on a tie whoever placed its last, so taking one word can stop a line or take it over. Fifteen seconds of break show the winner, then the scores reset. The rules are in `src/game.ts`, with the clock passed in so `test/game.test.ts` runs rounds instantly.

## 4 Consequences

- Taking a word now has a reason: it stops a rival's points, and may win their line. This answers whether taking feels like play or vandalism with a stake for both sides.
- Builders and raiders both have a strategy: build long lines that answer the prompt, or break the leader's.
- Points come from time standing, not speed of clicking, so a phone is not at a disadvantage.
- Prompts are word lists and lengths, not meaning: a line can answer "a colour" without being a good poem. The archive still keeps every line that stood, scored or not.
- Scores live in memory; a restart loses at most the current round. The ranking at each round's end is logged.
