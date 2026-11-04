# ADR 0082: Achievements, Awarded by the Server

Status: accepted, 5 November 2026. Peter asked for achievements, and then for no question marks: learned from the demo, not copied.

## 1 Decision

**A dozen moments, awarded by the server.** From a first close and a win held through a margin call to a pending order's fill, credit repaid, bankruptcy and naming a Replay's year. The rules are pure functions in `src/feats.ts` over the desk's own fills and the bell, so a page can claim none. A fill now says whether it came from a pending order and whether its position was ever under a margin call. Each is earned once, kept with the career by the same key as the hall of fame, and said in the feed of the round that earned it.

**A checklist, nothing hidden.** A medal among the header's tools counts them and opens a list of all twelve, each named with what it takes, the earned ones ticked first under a progress bar. Knowing a goal is half the reason to try for it, so none is a question mark.
