# ADR 0096: An AI Agent Plays Live through MCP

Status: accepted, 9 November 2026. Adds a way into Live ([ADR 0087](0087-marathon-on-real-prices-and-accounts-in-australian-dollars.md)) for AI agents, under the rules of [ADR 0010](0010-who-may-see-and-change-what.md). Peter asked for it; the convenor agreed it is an extra, marked only if a marker can reach it from `/readme/` with any MCP client.

## 1 Context

Peter wanted an AI agent to be able to play beside people, and had told the convenor so. The convenor's conditions: it must work with any MCP client against a `/mcp` endpoint, not only Claude Desktop, with the steps at the top of `/readme/` before the freeze. The game knows a player only by a browser cookie, and its rounds refuse anyone without the tab open, which an agent never has.

## 2 Options

- **Every mode.** An agent could start and play rounds as well as Live. Rounds count people by their open page and refuse a Start or a guess from anyone else, so an agent would first need a way to be present in a room without a page: rework of the rounds' core, hours before the freeze.
- **Live only.** Live has no rounds and no presence check; its one entry, the action a page sends, already decides everything on the server.
- **The official MCP SDK, or the protocol by hand.** The SDK is complete but a new dependency and lockfile change on the day of the freeze; the part an agent needs, JSON-RPC over HTTP answered as plain JSON, is small.

## 3 Decision

Peter first asked for every mode, then chose **Live only**. The protocol is answered **by hand** at `/mcp`, the streamable-HTTP transport with JSON replies, which every MCP client speaks; no key or login, since an agent's own client pays for its model.

- **A session is one new Live player,** an id of the same shape as a visitor's cookie, named "Agent" and a short code by the same rules as a person's name, starting with A$10,000. It sits on Live's board beside people.
- **Every tool goes through Live's own action,** the one a page sends, so an agent can bend no rule: `market`, `history`, `buy`, `sell`, `close`, `pending` and `cancel_pending`.
- **Limits:** twenty agents at once, one action a second each, a session ended after half an hour idle.
- **An agent wakes Live's price polling,** which a page starts by opening the tab; without it, an agent alone saw no price.

## 4 Consequences

A marker reaches it from one line of `/readme/`; it was checked with Claude Code as a real client and against the deployed app, and `spec/` holds the handshake. Reconnecting starts a new player, and an agent cannot play rounds; both are the cost of the narrower scope. Replies are in English, the server's own language, since an agent is the reader and there is no page to translate.

## 5 A Later Change: Sign-ups Are Limited in an Hour

Added 10 November 2026, after a review. Each session is a new player whose name is kept in the names file for good, and an ended session frees its place among the twenty, so a script that opened and closed sessions in a loop could fill the file's ten thousand names and leave none for a person. The server reads no client address, so the limit cannot be per client.

At most thirty sessions may open in an hour, across all agents; the thirty-first is refused until an hour has passed. At that rate a script would need two weeks of continuous opening to fill the file. The cost is that one script can use the hour's thirty and keep real agents out until it passes; a person is never kept out, and a marker needs one session.
