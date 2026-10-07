# Fridge Poetry

One fridge door, shared by everyone who visits, with one set of word magnets. Every word exists once, so the "moon" in your line is the "moon" nobody else can use, and when you come back your words are where you left them.

This is a first version of what would make it good. It will change as I build; the `crit-*` tags keep each version.

## Who it is for

A room of people using it at the same time: a crit group of about a dozen, or the capstone showcase. A single visitor gets a fridge with a few strangers' lines on it; the point is what happens when several people reach for the same words.

## What good means here

- **The words are shared and scarce.** Each word is one magnet. If you want "night" and it's in someone's line, you take it from them or write around it. I chose this over a shared canvas or a chat because it makes every other person on the door matter to what you can write.
- **Nobody can type.** The vocabulary is fixed at about a hundred words, so the door can be left open to strangers without moderation. The cost is expressiveness, and it is deliberate: the constraint is what makes fridge poetry work.
- **Your trace stays.** Your words stay where you left them, outlined as yours, unless someone has taken them since. Losing a word is part of it.
- **It works without a mouse.** Every word is a button you can focus and move with the arrow keys.
- **A line looks the same on every screen.** Positions and word sizes are fractions of the door, so a line written on a laptop is the same line on a phone, where the door scrolls sideways rather than shrinking the words.

## Enforced and judged

Checked by `spec/fridge.test.ts` against the running app:

- every word exists exactly once
- the server accepts only a position, so nobody can add or rename a word
- a move persists, and only the visitor who made it sees it marked as theirs
- the word moved last is drawn on top
- a move reaches every other open session within a second, with no reload

Judged by people, at the crit and the showcase:

- whether the vocabulary is good enough to write something worth reading
- whether taking each other's words feels like play or like vandalism

## What I looked at

- The final project brief's notes on good, which point at the small web, games for a handful of friends and tools built for one workshop.
- The week 8 lecture: good means serving the intended people well rather than counting features, and the README, `CLAUDE.md` and `spec/` should make the same promise.
- My crit 4 instrument, a solo theremin. I ruled out a shared step sequencer because it would repeat that work.
- About twenty-five candidate ideas, compared against how the final project is marked: ten minutes of use, a real decision about several people acting at once, and server logs with a story to tell. Fridge Poetry and an island-mapping game came out level; I chose the fridge because it is about words only one person can hold at a time.

## Not built yet

Not yet decided: what happens when two people grab the same word at once (for now, whoever lets go last wins), and whether a finished poem can be protected.
