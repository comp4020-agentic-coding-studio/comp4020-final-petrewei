# ADR 0001: Plain Node and a JSON File

Status: accepted, 7 October 2026 (crit 8).

## 1 Context

The crit 8 cutoff was about 90 minutes away when the idea was chosen. The app's state is about a hundred magnets, each an id and a position. The Fly setup gives one 256 MB machine and one volume at `/data`. Crit 9 needs real-time updates.

## 2 Options

- **Astro or another framework, as in crit 7.** Familiar, but a build step and dependencies for one page and three routes.
- **Node with SQLite, as in crit 7.** A schema and migrations for data that is one small array.
- **Plain Node (`node:http`, no dependencies) with one JSON file.** Node 24 runs the TypeScript in `src/` directly, so there is no build.

## 3 Decision

Plain Node and one JSON file at `/data/fridge.json`, written to a temporary file and renamed so a crash can't leave half a file. The server holds the array in memory and is the only writer.

## 4 Consequences

- One process owns all state, which makes server-sent events for crit 9 straightforward.
- Every move rewrites the whole file. That is fine at a hundred magnets and a room of users, and would need revisiting if moves became very frequent (for example, saving during a drag instead of at its end).
- No history is kept, only current positions. If the logs for crit 10 need history, they come from log lines, not this file.
