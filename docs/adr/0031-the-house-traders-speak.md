# ADR 0031: The House Traders Speak

Status: accepted, 26 October 2026. Gives voices to the seven characters of [ADR 0018](0018-anime-names-and-seven-characters.md), through the pops of the room's effects.

## 1 Context

The seven house traders each played a habit, but said nothing: a pop over a bot's row said what any trader's would, such as "Doubling down! 100×". The agent suggested they speak in character; Peter chose it, with scoring and replay clues.

## 2 Decision

At each moment a pop marks, a bot says one of its own lines: a big bet, doubling down, a win or a loss banked, a margin call, a forced cut, a wipe-out, a loan from Dad, a prayer. Kurumi denies and borrows, Mochiko is clinical, Yasuko waits for the crash, Mebuki naps on the interest, Inago follows the crowd, Nana keeps faith, Kizuna chases a billion. The lines are original, written in each character's voice in each language's own; none is the comic's, and none touches the family's grief. A bot does not say the same line twice running, and speaks on a prayer at most every six seconds, or a losing one would drown the room.

The room list sits low on the page, and a bubble over a row that is off screen is never drawn. Measured in one round, the stream carried 75 of the bots' moments and the page showed 15. A bot whose row is out of view now says its line in the feed instead, with its face and name, for twenty seconds, quoted as each language quotes speech; one in view keeps its bubble. In the next round five characters spoke, thirty times in bubbles and eighteen in the feed.

## 3 Consequences

- The characters are present: Kurumi's round reads as her story, from "1000×. It's fine" to "Just until it turns, Dad."
- Speech is the page's alone; the server sends only the moment, so the lines cost nothing on the wire and follow the reader's language.
- `test/i18n.test.ts` checks every bot has lines for every moment in every language, and the same shape in each.
