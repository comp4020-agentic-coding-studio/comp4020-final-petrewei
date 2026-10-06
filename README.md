# Fridge Poetry

One fridge door, shared by everyone who visits, with a single set of word magnets on it. You make a line by moving words around. Every word exists once, so the "moon" in your line is the "moon" nobody else can use, and when you come back the words you moved are still where you left them.

This is a first version of what I think would make it good. It will change as I build; the `crit-*` tags keep each version.

## Who it is for

A room of people who are using it at the same time: a crit group of about a dozen, or the capstone showcase. It is not for one person writing alone. A single visitor gets a fridge with a few strangers' lines on it; the point is what happens when several people are reaching for the same words.

## What good means here

- **The words are shared and scarce.** Each word is one physical magnet. If you want "night" and it's in someone's line, you have to take it from them or write around it. That is the whole game, and I chose it over a shared canvas or a chat because it makes every other person on the door matter to what you can write.
- **Nobody can type.** The vocabulary is fixed, about a hundred words, so the door is safe to leave open to strangers without moderation. The cost is expressiveness, and that cost is deliberate: constraint is what makes fridge poetry fun.
- **Your trace stays.** You come back and find your words where you left them, outlined as yours, unless someone has since taken them. Losing a word to someone else is part of it, not a bug.
- **It works without a mouse.** Every word is a button you can focus and move with the arrow keys.
- **A line looks the same on every screen.** Positions and word sizes are both fractions of the door, so a line written on a laptop is the same line on a phone. On a narrow screen the door keeps a readable size and scrolls sideways rather than shrinking the words.

## Enforced and judged

Checked by `spec/fridge.test.ts` against the running app:

- every word exists exactly once
- the server accepts only a position, so nobody can add or rename a word
- a move persists, and only the visitor who made it sees it marked as theirs

Judged by people, at the crit and the showcase:

- whether the vocabulary is good enough to write something worth reading
- whether taking each other's words feels like play or like vandalism

## What I looked at

- The final project brief's notes on good, which point at the small web, games for a handful of friends and tools built for one workshop.
- My own crit 4 instrument, a solo theremin. I ruled out a shared step sequencer because it would repeat that work, and I wanted to answer a different question this time.
- About twenty-five candidate ideas, compared against how the final project is marked: whether each holds ten minutes of use, raises a real decision about several people acting at once, and gives the server logs a story to tell. Fridge Poetry and an island-mapping game came out level; I chose the fridge because it is about words that only one person can hold at a time.

## Not built yet

Real-time updates are next (crit 9): right now you see other people's moves when you reload. Also not decided: what happens when two people grab the same word at once, and whether a finished poem can be protected.
