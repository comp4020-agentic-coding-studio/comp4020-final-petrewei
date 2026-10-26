# ADR 0040: Who You Are on the First Row

Status: accepted, 27 October 2026. Refines the header of [ADR 0039](0039-a-tidier-page.md).

## 1 Context

After the language picker became a globe, Peter looked at the page on his phone and found his name still pushed onto a row of its own, below the tabs. The first row held the logo and its subtitle, the tools, and no room for him.

## 2 Decision

On a narrow screen the subtitle is hidden, as the logo alone says the name and the page title carries the rest. The first row is the logo, who you are and the tools, in that order, and the tabs take the second row. On a phone who you are also gives up its padding and its pencil, and the tools and logo shrink a little, so a name has the room: the pencil goes because a tap and the tip already say it can be changed.

## 3 Consequences

- At 360px a name of nine letters, such as Tsukimori, shows in full in English, and one of six characters in Chinese; a long Japanese name, or any name at 320px, is cut with an ellipsis.
- The header is two rows on a phone, not three.
- `test/tips.test.ts` checks that the narrow rules hide the subtitle and put the name and the tools on the first row.
- A browser check measured the name at 320, 360 and 390px in all three languages, and first found the name still clipped after the move alone, which is why the padding and pencil went.
