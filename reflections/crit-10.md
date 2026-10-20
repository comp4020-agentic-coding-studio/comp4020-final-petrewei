# Crit 10 Reflection

## 1 What Was the Breakthrough That Moved the Work Forward?

Treating the log as the interface for the crit. I will narrate two classmates from `flyctl logs` alone, and the lecture's point that logs are evidence, not a diagnosis, changed what I asked the server to write. Each line names who acted, by a short hash and the trader name the room sees, what they did, on which tab, and why anything was refused. A rehearsal with two simulated players read like the game: one buys at 100×, the other is refused 7× leverage, sells at 5×, sets a stop, prays, and is stopped out. Writing [ADR 0010](../docs/adr/0010-who-may-see-and-change-what.md) put the lecture's rule about the write boundary into practice: a page sends only a choice, never a price, so the stop button now asks for "1% away" and the server sets the level. A whole-repository `/code-review` showed why direct requests matter: a body of `null`, which no page sends, would crash the live server.

## 2 What Did This Work Change About Who I Want to Be as a Software Developer?

I want to judge a harness by what it catches, not by how much it adds. The lecture warns that a new rule or agent is not an improvement until tested on real work, and this week bore that out: `/code-review` found bugs my own `/simplify` pass had introduced, and the auto-mode check refused my agent's SSH into production, so I ran that deletion myself. The harness also let one thing through: at my agent's suggestion I echoed the operator key into a session transcript. I rotated it and checked the old key now gets a 404. Logs, transcripts and tool output are where secrets leak, and I want to treat them so early.
