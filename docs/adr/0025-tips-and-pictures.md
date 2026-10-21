# ADR 0025: Tips and Pictures

Status: accepted, 22 October 2026. Extends the faces of [ADR 0021](0021-pixel-faces.md) and the ticket of [ADR 0024](0024-pause-ironman-and-a-trading-ticket.md).

## 1 Context

Peter asked for more hover tips across the page, so details stop taking space in the line: the trader code after his name, and "no pausing" after Ironman. Tips could explain or be sarcastic, balancing fun and use. He found a ticked box too plain for ironman, and asked for more icons, emoji, pixel art and graphics, so the page reads faster and is funnier. The page used the browser's `title`, which shows late, looks plain, and never shows on keyboard focus or touch.

## 2 Decision

**One tip for the page,** in `public/tips.js`: shown after a moment's hover, at once on keyboard focus, and on a long press on a touch screen; kept inside the window; named to screen readers through `aria-describedby`. An element names its tip by key, `data-tip`, or the page sets its text, `data-tip-text`, for tips that carry values. Every control on the market has one, 44 in all, and none uses `title`. Each tip is written in each language's own voice: plain for what a control does, wry where the parody earns it ("Remove the stop. Bold. Possibly fatal."), and plain always for the ones that end a round for others.

**Details move into tips.** Your code leaves "You are", which now holds only face, name and pencil, and the name shrinks before the pencil is cut. "No pausing" leaves Ironman. A room row shows a percentage, its yen and code in the tip; a bot's tip is its motto. The words "bot", "left" and "wiped out" become 🤖, 🚪 and 💀, named to screen readers.

**Ironman is a switch,** a track and knob with an iron fist that lights when it is on, announced as a switch.

**Pictures.** Every feed line and pop-up wears an emoji for its kind, from 📈 to 💀, and the tabs and panel headings one each. The bell and the hall give the top three 🥇🥈🥉. Six props are drawn by hand on the faces' 16×16 grid in `public/art.js`: a bell that swings when it rings, a teacup on a pause, a skull on the losscut, a piggy bank on Dad's loan, a trophy, and the fist. Motion stops for anyone who asks for reduced motion.

## 3 Consequences

- The page says what each control does without a manual, in three languages, and the line keeps its room for names.
- Japanese tab names are the longest and now share their tabs with icons, so they are set a touch smaller on every screen and lose their icons on phones. At 360px チュートリアル still overflows by 4px, as it overflowed by 9px before.
- `test/tips.test.ts` checks that every control has a tip in every language and that no `title` remains, that ironman is a switch whose label no longer explains it, that every feed and pop kind has an icon, and that each prop is pixels only. `test/pages.test.ts` now checks that every element the page script asks for by id exists: the switch replaced `#ironman-box`, and the countdown threw in the browser while every check passed.
