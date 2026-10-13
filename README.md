# Fridge Poetry

One fridge door, shared by everyone who visits, with one set of word magnets. Every word exists once, so the "moon" in your line is the "moon" nobody else can use.

This is a working definition of good.

## Who it is for

A room of people using it at once: a crit group of a dozen, or the showcase. It is situated software in Clay Shirky's sense, "designed in and for a particular social situation", and built the way Robin Sloan cooks his family's messaging app: for the people present, not to scale.

## What good means here

- **The words are shared and scarce.** Each word is one magnet. If you want "night" and it's in someone's line, you take it or write around it. Unlike a canvas or a chat, this makes everyone on the door matter to what you can write.
- **Nobody can type.** A fixed vocabulary of about 160 words ([ADR 0004](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/blob/main/docs/adr/0004-a-vocabulary-of-about-160-words.md)) lets strangers share the door unmoderated. The constraint is the point, as for the Oulipo, and Dave Kapell's 1993 kit began as guests composing on his fridge.
- **One hand at a time.** A held word glows for everyone else and can't be taken, as with a real magnet ([ADR 0002](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/blob/main/docs/adr/0002-one-hand-at-a-time.md)).
- **Your trace stays, and so does its loss.** Your words stay where you left them, outlined as yours; take one, and its owner is told, never by whom.
- **Nothing written is lost.** A line that stood and was broken goes to the archive under the fridge ([ADR 0003](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/blob/main/docs/adr/0003-an-archive-of-broken-lines.md)), so taking a word costs a line, not the poem.
- **It works without a mouse.** The arrow keys move any word.
- **A line looks the same on every screen.** Positions and sizes are fractions of the door; a phone scrolls it sideways.

## Enforced and judged

Checked in `spec/` against the running app:

- every word exists exactly once
- the server accepts only a position, so nobody adds or renames a word
- a move persists, and only the visitor who made it sees it marked as theirs
- the word moved last is drawn on top
- a move reaches every other open session within a second, with no reload
- a held word can't be grabbed or moved by anyone else, and is freed when its holder lets go, leaves or lapses
- when someone takes your word you're told, and only you
- a broken line is archived if it stood, and not if it was broken at once
- every action is logged by short code, never a cookie, for the operator only ([ADR 0007](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/blob/main/docs/adr/0007-who-may-see-and-change-what.md))

Judged by people, at the crit and the showcase:

- whether the vocabulary lets people write something worth reading
- whether taking words feels like play or vandalism

## What I looked at

- Clay Shirky, ["Situated Software"](https://gwern.net/doc/technology/2004-03-30-shirky-situatedsoftware.html) (2004): his students' apps for groups of dozens to a couple of hundred, against the Web School's "scalability, generality, and completeness".
- Robin Sloan, ["An app can be a home-cooked meal"](https://www.robinsloan.com/notes/home-cooked-app/): an app for his family of four.
- Maggie Appleton, ["Home-Cooked Software and Barefoot Developers"](https://maggieappleton.com/home-cooked-software): language models put such apps within more people's reach, as they did mine.
- The [Oulipo](https://en.wikipedia.org/wiki/Oulipo) and [Magnetic Poetry](https://en.wikipedia.org/wiki/Magnetic_Poetry): writing from constraint.
- The brief and week 8 lecture: good means serving people well, and README, `CLAUDE.md` and `spec/` agree.
- About twenty-five candidate ideas; a sequencer was out as a repeat of my crit 4 theremin.

## Left out

Protecting a standing poem. Taking stays free; the archive keeps what breaks.
