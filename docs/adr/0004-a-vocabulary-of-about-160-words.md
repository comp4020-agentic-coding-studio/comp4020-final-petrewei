# ADR 0004: A Vocabulary of About 160 Words

Status: accepted, 8 October 2026.

## 1 Context

The first vocabulary was the agent's draft of 108 words, each existing once. It had no "me", "it", "no", "but", "go", "see" or "love", so many ordinary lines could not be written at all. Commercial magnetic poetry kits carry 200 to 400 tiles, with several copies of common words. A magnet's id is its index in `src/words.ts`, and the saved door keys every position by id.

## 2 Options

- **Size:** keep 108, grow to about 160, or grow to 200 or more.
- **Copies:** none, or two or three of a few small words such as "the" and "a".
- **Order:** rewrite the list in categories, or append the new words to the end.

## 3 Decision

Peter chose about 160 words with no copies. Each word still exists once, so the README's central claim stays exactly true, and fighting over "the" is part of the game. 160 fills the commonest gaps while words still run out in a room of a dozen. The new words are appended to the end of the list, so every existing id, and every saved position on the live door, keeps its word.

## 4 Consequences

- The starting heap no longer fits nine to a row, so `seed()` packs words left to right by their estimated width (`width()` in `src/lines.ts`), and words nobody has moved are laid out afresh at every start, so the heap always matches the current layout.
- The appended words sit together at the end of the heap rather than among their kind.
- A later change to the vocabulary must also append, or migrate the saved door.
