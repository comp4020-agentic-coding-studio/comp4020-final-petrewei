# ADR 0006: A Journal of Moves

Status: accepted, 14 October 2026. Supersedes the loss window that [ADR 0005](0005-batched-writes.md) accepted; batching stands. Superseded on 15 October 2026 by [ADR 0009](0009-a-parody-fx-trading-floor.md): the fridge was replaced.

## 1 Context

ADR 0005 batched writes so the move path no longer blocks on the disk, and accepted that SIGKILL or the out-of-memory killer could lose the last 500ms of moves already confirmed to their visitors. Before crit 9, Peter asked for that gap closed.

## 2 Options

- **Keep the window.** Simplest; a confirmed move can still vanish on a hard kill.
- **Write the whole door synchronously again.** No window, but it undoes ADR 0005's reason for batching.
- **Append each move to a journal.** One short line per move, written before the reply; the batched write of the whole door then empties the journal.

## 3 Decision

A journal. Each move is appended to `/data/moves.log` before its visitor is told it worked. An append hands the line to the operating system at once, so killing the process cannot lose it. When the batched write of `fridge.json` succeeds, the journal is emptied, so it holds only the moves since. At startup the server replays it in order over the saved door, and skips a last line cut short by the kill, since that move was never confirmed.

## 4 Consequences

- A confirmed move survives SIGKILL and the out-of-memory killer; `test/journal.test.ts` kills a real server straight after a move and checks the move is there on restart.
- A loss of power before the operating system writes its cache can still lose the last moments, as for any file written without `fsync`.
- Theft notices and the archive are still batched without a journal: losing half a second of them on a hard kill costs a notice or one archived line, not someone's placed word.
