# ADR 0017: Chosen Trader Names

Status: accepted, 21 October 2026. Amends [ADR 0010](0010-who-may-see-and-change-what.md), where a trader's name was always drawn from their cookie.

## 1 Context

A person was a cookie, shown as a name drawn from it, such as Lucky Pip. Nobody could type a name, so nothing needed moderating, but nobody could choose one either, and two people could be drawn the same. Peter asked for better identity in the top bar: a name of one's own, and a button to draw another at random.

## 2 Options

- **Keep drawn names, add a redraw:** no typing, so nothing to police, but still no name of one's own.
- **Free text, checked on the server:** any name in any of the three scripts, under rules the server enforces.
- **Accounts with passwords:** a name kept across browsers, at the cost of passwords to store for a game of play money.

## 3 Decision

Peter chose free text with a button to draw a name; the agent wrote the server's rules, and kept the drawn name as the default. Clicking "You are …" opens a box with the name field, a button that draws a name nobody holds, and Save. Drawing changes nothing until it is saved.

The server decides what a name may be, because a page's code is in every visitor's hands. A name is trimmed and its spaces collapsed; it is up to 20 wide, a Japanese or Chinese character counting as two; it starts with a letter or number and holds only letters, numbers, spaces and simple punctuation, so no markup or control characters; it is none of the house traders' names in any language, nor Kurumi's Chinese nickname 韭留美, which the first live check found was missing; and it is nobody else's, compared ignoring case, spacing and full-width forms, among chosen names, the hall of fame and the pages open now. Each refusal is in all three languages.

A chosen name is kept on the volume in `names.json` under the person's career key, so it outlives a restart, and the hall of fame takes it. Every page sees it with the next broadcast. The log records a `rename` with the old name, so the operator can still follow one person by short code.

## 4 Consequences

- People can be told apart by name as well as code, and a name can be in Japanese or Chinese.
- A name is still tied to one browser's cookie: clearing cookies loses it, and it cannot be moved to another device.
- Free text can still be rude within the rules. The game is for a crit group and the showcase; the operator can remove a name from `names.json` and restart.
- `spec/names.test.ts` checks the refusals, the draws, that the room sees a new name and that nobody else can take it; `test/i18n.test.ts` checks the refusals are translated.
