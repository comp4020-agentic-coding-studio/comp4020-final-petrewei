# ADR 0002: One Hand at a Time

Status: accepted, 8 October 2026 (crit 9).

## 1 Context

Moves now reach every open page within a second ([ADR 0001](0001-plain-node-and-a-json-file.md), `spec/realtime.test.ts`). Crit 9 asks for one decision about how the app behaves when several people use it at once. The one that matters most here is what happens when two people grab the same word, because the app's central rule is that each word exists once. Until this record, the last person to let go won, and the other person's move vanished with no explanation.

## 2 Options

- **Last to let go wins.** Nothing to build, but a move can disappear from under someone with no sign of why, which reads as a bug.
- **One hand at a time.** While someone holds a word, everyone else sees it held and cannot take it until it is let go.
- **Snatch.** A second grab pulls the word out of the first person's hand. Competitive and funny at a showcase, but it rewards griefing, and the README would have to argue that it is play rather than vandalism.

## 3 Decision

One hand at a time, chosen by Peter. It extends the rule that each word exists once to "and only one person can hold it", which is how a real magnet behaves. Grabbing a word asks the server for it; the server refuses a grab or a move on a word someone else holds, and tells every open page when a word is taken and when it is free again.

## 4 Consequences

- A hold has to end even when its holder does not let go cleanly. It ends when the holder drops or moves the word, when their last open page closes, or after 30 seconds with no sign of them; a long drag renews it.
- Someone who reaches for a held word is told it is held, instead of finding their move undone afterwards.
- A word can be kept away from others for at most 30 seconds at a time unless its holder is actively dragging it. Hoarding by holding is limited, not prevented.
- Grabs and releases are extra requests and broadcasts, on top of moves.
