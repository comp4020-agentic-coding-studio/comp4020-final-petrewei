# ADR 0007: Who May See and Change What

Status: accepted, 14 October 2026 (crit 10).

## 1 Context

Crit 10 asks that what each person may see and change is checked on the server, and that the decision is written down. The app has no accounts: a person is a visitor, the random cookie the server hands out, and nothing else identifies them. Rules about the door were made one decision at a time, in ADRs 0002 and 0003 and in the code; this record gathers them. Gathering them showed one conflict: the README promises that a theft notice never says by whom, while the public `/stats` page showed who took whose word by short code, and a visitor can find their own code by moving a word and watching.

## 2 Options for the Activity Log

- **Public, as it was.** Anyone can watch the room, but anyone can find out who took their words, so the README's "never by whom" would have to shrink to "never by name".
- **Public, without whose.** The log keeps its counts but drops `from`, losing the most telling event for the crit 10 demo.
- **The operator's alone.** The log needs a secret key, checked on the server.

## 3 Decision

Peter chose to keep the log to the operator. Every rule below is checked on the server, not the page, because a page's code is in each visitor's hands.

| Who | May see | May change | Checked by |
| --- | --- | --- | --- |
| Any visitor | every word's position and text; whether a word is held, but not by whom; whether a word is theirs, but never who else moved one; the archive's poems, without authors | a word's position, nothing else, and not while someone else holds it | `spec/fridge.test.ts`, `spec/hold.test.ts` |
| A word's holder | the same | that word, until they let go, leave, or the hold lapses after 30 seconds | `spec/hold.test.ts`, `test/holds.test.ts` |
| A robbed visitor | which of their words were taken, never by whom; only their own notices | marking their own notices as seen | `spec/taken.test.ts` |
| The operator, with `STATS_KEY` | the activity log: every action by short code, including whose word was taken | nothing more than any visitor | `spec/stats.test.ts`, `test/stats.test.ts` |

The key is a Fly secret, compared in constant time, and never in the repo. Without it, `/stats`, `/stats.js` and `/api/stats` answer 404, the same as a path that doesn't exist; with no key set, the log is shut to everyone.

## 4 Consequences

- "Never by whom" holds for every visitor. A short code is a hash of a cookie, so it can't be turned back into the cookie or used to act as that visitor.
- The crit 10 demo is narrated from `/stats?key=…` on the presenter's screen; the key must not be shown to the room or put in a shared link.
- `flyctl logs` shows the same lines to anyone with the app's Fly token, which is the operator and the course staff, never visitors.
- A visitor who copies another's cookie becomes them. There are no accounts to protect, and nothing here is worth more than a magnet's position, so this is accepted.
