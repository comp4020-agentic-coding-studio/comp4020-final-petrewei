# ADR 0005: Batched Writes

Status: accepted, 9 October 2026. Supersedes the write-per-move consequence of [ADR 0001](0001-plain-node-and-a-json-file.md); the rest of ADR 0001 stands.

## 1 Context

ADR 0001 accepted that every move rewrites the whole of `/data/fridge.json`. A `/simplify` review measured what that costs in a showcase-sized room: about 30 moves a second from 60 visitors, each a blocking write and rename of the whole file on the move's path, plus a rewrite of `taken.json` whenever a word is taken from someone who has left.

## 2 Options

- **Keep writing on every move.** Nothing confirmed is ever lost, but every move blocks the server on the disk.
- **Batch writes on a short timer.** At most one write per file per interval, at the cost of a window in which confirmed changes exist only in memory.
- **Move to SQLite.** Small writes per change, at the cost of the machinery ADR 0001 chose to avoid.

## 3 Decision

Batch writes. `persist()` marks a file as changed, and `flush()` writes it at most every 500ms, through a temporary file and a rename as before. A failed write is logged and retried at the next flush instead of taking the server down. Pending writes are flushed on any exit Node can see: SIGINT or SIGTERM from a Fly stop or deploy, and an uncaught exception.

## 4 Consequences

- A move is confirmed to its visitor before it reaches disk. If the process is killed with SIGKILL or by the out-of-memory killer, the last 500ms of moves, poems and theft notices are lost. A routine Fly stop or deploy loses nothing; checked by moving a word and sending SIGTERM at once.
- The move path no longer touches the disk.
