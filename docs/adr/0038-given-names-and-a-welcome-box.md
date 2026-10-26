# ADR 0038: Given Names and a Welcome Box

Status: accepted, 27 October 2026. Changes the drawn names of [ADR 0018](0018-anime-names-and-seven-characters.md) and [ADR 0017](0017-chosen-trader-names.md); the face of [ADR 0021](0021-pixel-faces.md) is chosen in the same box.

## 1 Context

Peter asked that a trader go by a given name alone, such as Kurumi and not Fukuga Kurumi, for people and house traders alike; that the page stop saying "You are" before the name; that the hall of fame be cleaned; that a newcomer with no record be given the name box to choose a name and a face; that the box carry the language, music and theme controls at its top right and the tutorial and free play below; and that its tooltips sit over the box, not under it.

## 2 Decision

**Given names alone.** The seven house traders are Kurumi, Mochiko, Yasuko, Mebuki, Inago, Nana and Kizuna in every language: くるみ, 萌智子, やす子, 芽吹, いなご, なな and きずな in Japanese, and 久留美, 安子, 芽吹, 稻子, 奈奈 and 绊 in Chinese. A drawn name is one of 124 given names with a form in each language, so a draw is a single number the server sends and each page writes in its own script. The family names are gone. A name saved as a family and a given name keeps the given one, and the old full names of the house traders stay reserved so nobody can take them. The line at the top is the face and the name with its pencil, with no "You are"; the code stays in its tip.

**A clean hall.** Names changed shape, so the hall began again, once. The server empties the saved hall the first time it starts without a marker file beside it, then writes the marker; careers saved after that are kept. Peter chose to wipe it, rather than keep the records under shorter names.

**A box for a newcomer.** The server tells a page whether its visitor is named, which is true once they have a chosen name, a chosen face or a career, or are a house trader. A page that is told no opens the name box on its own, with a welcome title, a name and face already drawn, and no Cancel, and Escape does not close it. Two buttons below take the player on, the tutorial at the left and free play at the right, on the market they were on; either saves the name and face first. Reopening the box from the name later is the old rename, with Save and Cancel.

**Tools in the box.** The same language, music and theme controls as the header sit at the box's top right, each wired to the same state, so a newcomer who reads Japanese can say so before choosing a name.

**Tips over the box.** A tip is now a popover in the browser's top layer, positioned from the viewport, so a dialog never covers it.

## 3 Consequences

- A name is short, so rooms, feeds and the hall read easily; two people may no longer hold names that differ only by family name, since there is none, and the server still refuses a name someone has.
- A newcomer is asked once, before they trade, and can reach the tutorial or the markets from the same box.
- `test/names.test.ts` checks that every given name has each language's form and none collides across languages, that no house trader's name is drawn, and that the house traders are given names alone in every language; `test/log.test.ts` that an older hall is emptied once and a newer one kept; `spec/names.test.ts` that a newcomer is not yet named, and is once they choose; `test/tips.test.ts` that the box carries the tools above its title and two ways to begin below, that "You are" is gone, and that a tip is a popover.
- A browser check on a fresh server opened the box for a newcomer, kept it open on Escape, showed a tip over it, switched the theme from inside it, and began the tutorial; and measured it at 360px in English, Japanese and Chinese, where it first overflowed.
