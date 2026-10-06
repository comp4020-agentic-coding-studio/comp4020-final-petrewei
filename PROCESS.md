# Process Overview

## 1 Choosing What to Build

On the morning of the crit 8 cutoff the repo was still the starter: one commit, a placeholder page and no idea. Preflight failed on three counts (no reflection, the template `PROCESS.md`, nothing built), so I stopped the ship and started from the idea, with about two hours left.

I asked the agent for candidates and then for an adversarial comparison, and kept asking for more until about twenty-five ideas had been argued against. The first ranking judged them on what could be live by 07:00 and picked a shared "commons lamp", because it was the smallest thing that met the brief. I said I valued the final artefact's potential more than tonight's ease, so the agent read the crit 9 and 10 specs and the final project's marking. That changed the tests: the app had to hold ten minutes of a marker's use, raise a real decision about several people acting at once (crit 9), and give the logs a story (crit 10). Under those tests the lamp dropped to last. The agent then recommended a shared step sequencer when I said I could take engineering risk; I rejected it because my crit 4 project was already an instrument, and I wanted the final project to answer a different question. Of the last three (Fridge Poetry, an island-mapping game and a model railway), the agent rated the railway lowest because its "good" argument was weakest, and I chose Fridge Poetry. The rule that made it more than a magnet toy, that each word exists once, came out of comparing it with a letterpress idea where the type runs out.

## 2 Stack

I chose plain Node with no dependencies and one JSON file on the volume ([ADR 0001](docs/adr/0001-plain-node-and-a-json-file.md)). The data is about a hundred positions, so SQLite and migrations (crit 7's stack) would have been machinery without a job, and one process owning all state makes server-sent events simple for crit 9.

## 3 Building the First Version

The first version is [`3baa0c1`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/commit/3baa0c1): a door where you drag or arrow-key a word, the server accepts only `{x, y}` for a known word, and a visitor cookie marks the words you moved so you can find them when you come back. `spec/fridge.test.ts` holds those promises against the running app, including the live one, so each test puts back the word it moves. The first browser check found a bug the tests could not: dragging "moon" moved "lost", because the starting heap stacked words on top of each other. I changed the seed to rows across the bottom half of the door before committing, but that only fixed the first load. When I ran `/simplify` over the first version, its altitude review found the real cause: magnets stacked in vocabulary order, so a word dropped onto a later one went underneath it again. In [`03e99c4`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/commit/03e99c4) the server keeps the last-moved magnet last and the client draws it on top, with a spec check on the order, and the anchor now slides with the position so a word dragged to the edge stays on the door. The README, `CLAUDE.md` and the ADR followed in [`d586374`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/commit/d586374). `CLAUDE.md` is carried over from crit 7 and cut down to the rules this app needs.

## 4 What Comes Next

Crit 9 adds real-time updates and one written decision about several people at once. The likely one is what happens when two people grab the same word.
