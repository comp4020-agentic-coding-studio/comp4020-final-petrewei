# ADR 0014: Simultaneous Actions

Status: accepted, 21 October 2026.

## 1 Context

The week 10 lecture separates a multi-user app's identity, authorization and concurrency, and asks each to be decided rather than left to chance. [ADR 0010](0010-who-may-see-and-change-what.md) covers who may see and change what. This record covers what happens when two people act at the same moment: two press Start, a crowd orders at once, or one person double-clicks. The lecture's warning applies: two requests can both answer `200` while one person's change is lost.

## 2 Options

- **Last write wins:** each request overwrites shared state; simple, but a lost update is silent.
- **Optimistic versions:** a request names the version it saw and is refused if the state has moved on; right for editing a shared record from a stale view.
- **Locks:** one person holds the right to act until they let go.
- **Serial application:** every request is applied whole, in arrival order, to state no other request can touch meanwhile.

## 3 Decision

The agent proposed serial application, since the server already has it; Peter accepted it. One Node process owns both markets, and each request runs to completion before the next, so its read and write of a desk are one step that nothing can interleave. An order is not an edit of a shared record: it fills at the price when it arrives, against the trader's own account, so there is no stale view to protect against. The price is the only shared value, and only the clock changes it. Two Starts at once start one round: the first moves the market to its countdown, and the second is refused with "The round is already about to start." A double click lands as an order and then an add, each against the money free at that moment.

## 4 Consequences

- No action is lost or applied to someone else, which `spec/concurrency.test.ts` checks with twelve simultaneous orders and a double click, and `test/log.test.ts` with two Starts at once on a fresh server.
- The guarantee rests on one process. A second machine, or work that awaits between reading and writing a desk, would break it and need versions or locks; this record would then be superseded.
- Every action and its request share an ID in the log, so the order the server applied them in can be read back, request by request.
