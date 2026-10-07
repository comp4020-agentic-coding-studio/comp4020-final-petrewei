# ADR 0003: An Archive of Broken Lines

Status: accepted, 8 October 2026 (after crit 8). The thresholds were the agent's proposal; Peter kept them on 8 October, and decided against protecting a standing poem on the door, since the archive keeps it.

## 1 Context

Each word exists once, so writing a line usually means taking words out of someone else's. Until now that destroyed the other line without trace, and the door only ever showed the present. The brief asks directly whether an app keeps history, and the top marking band tries a session picked up the next day, when the door has usually been rearranged. Peter chose an archive from the agent's proposals after crit 8.

## 2 Options

- **Only the present.** The door is the record; a line that is broken is gone. Simplest, and true to a real fridge, but it makes taking a word purely destructive.
- **Snapshots of the whole door** at intervals. Keeps everything, including the heap of unused words, and most of it is not poetry.
- **An archive of broken lines.** When a line of words breaks, its text is kept with when it broke. Only what someone wrote is kept.

## 3 Decision

An archive of broken lines. A line is three or more words that have been moved (so the starting heap is never read as poetry) sitting on one row with gaps of at most about two letters; `src/lines.ts` estimates each word's width from a formula fitted to every magnet as rendered (within 0.66em), since the server never sees the page. When a line stops existing, and is not simply extended into a longer one, it is archived if it stood for at least 15 seconds. The archive shows newest first, under the fridge, updated live, and keeps the latest 200.

## 4 Consequences

- Taking a word now has a visible cost and a record: the line it came from is preserved.
- Width is estimated, not measured, so a line with unusual gaps may not be recognised. Lines are judged in a 4:3 door, the same on every screen.
- A line that stands for under 15 seconds is not kept, so quick rearranging does not fill the archive, but an unfinished line left alone for 15 seconds is.
- The archive test writes a poem, so it runs only against a throwaway server (locally and in CI), never against the live door, where it would put a fake poem on the public wall.
- History is lines, not authors: the archive never records who wrote or broke a line.
