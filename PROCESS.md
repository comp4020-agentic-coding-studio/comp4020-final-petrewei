# Process Overview

The brief asks for a multi-user, real-time website that is good, and leaves "good" to me. I defined good as a room laughing at a wipe-out, then understanding why.

Each section below covers a call I made while directing agents: why it beat the obvious alternative, how I checked the result before accepting it, and what I threw away. The [decision records](docs/adr/README.md) hold the detail.

## 1 Choosing the Idea and the Stack

For crits 8 and 9 the app was Fridge Poetry, shared word magnets. After crit 9 I judged it unplayable: scored rounds ([`4c5f328`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/commit/4c5f328)) did not help, because nothing in it got better with more people.

- I had the agent survey what classmates were building. Co-op, racing and cards were crowded.
- I proposed a shared FX market parodying *FX Fighter Kurumi-chan*, where leverage is the joke and the lesson, and played the prototype before replacing the fridge ([`66449d4`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/commit/66449d4), [ADR 0009](docs/adr/0009-a-parody-fx-trading-floor.md)).
- Shirky's essay on situated software set the scope: a game for one room, such as a crit group or the showcase, where a wipe-out happens in front of people you know.
- I chose plain Node with JSON files over Astro or SQLite. One process owning the price suits a shared market, and a schema bought nothing for one small state. The cost is that I write by hand every rule a database would enforce ([ADR 0001](docs/adr/0001-plain-node-and-a-json-file.md)).

## 2 Rules Before Code

In a trading game the main risk is a page that decides money, and an agent will write one if asked loosely.

- Before the broker existed, I put two rules in `CLAUDE.md`: the server owns every price and fill, and a page sends only what the player chose ([`4269d0a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/commit/4269d0a), [ADR 0010](docs/adr/0010-who-may-see-and-change-what.md)).
- Tests came before `src/fx.ts` ([`8c98e74`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/commit/8c98e74)).

I saw the rule working when I asked for an order at a typed price. The request invited a page to set a price. The agent instead made the level a trigger that the server fills at its own price, without my stepping in, and a test holds it ([`30c59a4`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/commit/30c59a4)).

## 3 Testing What the Page Sends

I chose all seven gameplay ideas the agent proposed, including duels between two people ([`804c6d5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/commit/804c6d5), [ADR 0095](docs/adr/0095-gameplay-for-the-player-and-the-room.md)). Every unit test passed, yet in two real browsers a challenge never arrived. The page's request builder dropped it, and the server's tests post directly, so they never ran that step.

I treated it as a gap in the harness and fixed it there:

- a browser check clicks through a duel and fails without the fix ([`e26b32c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/commit/e26b32c))
- a unit check lists every action the page sends ([`f5ad2dd`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/commit/f5ad2dd))
- `CLAUDE.md` says to trace a request across every boundary it crosses

## 4 Reviewing Other Agents' Work

I used subagents for parallel reads, and Codex as a reviewer from a different model, since a model reviewing its own work shares its blind spots. Their findings can be confidently wrong, so I judged each against the running app.

- One Codex refactor wrapped the saved files in a format the deployed version could not read, which would have crashed a rollback on start. I kept the old format and took the rest ([`37a0790`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/commit/37a0790)).
- On freeze day a second Codex pass merged the two desks' pending-order code into one function. Because it touched money rules, I wanted proof of equivalence first: 534 tests passed, and a script fed 10,000 random orders to the old and new desks and got the same refusals and accounts ([`374d66c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/commit/374d66c)).
- A test review proposed fifteen removals. I removed the two that another named test still covered and kept the rest ([`68f7cbe`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/commit/68f7cbe)).

## 5 Prices, House Traders and AI Agents

- **Rewind's prices.** Random ticks between daily closes invented everything finer, so I chose HistData's free minute bars. Rewind replays five real days around each crisis, with the dates hidden until the bell ([`33d9bc8`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/commit/33d9bc8), [ADR 0073](docs/adr/0073-real-minutes-for-replay.md)).
- **Live's prices.** The agent tested free sources from Fly's own machine and put four choices to me. I chose Yahoo Finance and Australian dollars ([`f5c76af`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/commit/f5c76af)).
- **House traders.** A newcomer alone in an empty room tends to leave, so I made the comic's seven characters real Live players who go bankrupt and come back like anyone, trading through the same action a page sends ([`207c75a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/commit/207c75a)).
- **AI agents.** I let agents join over MCP after asking the convenor. I first asked for every mode, then narrowed it to Live when the agent showed that rounds would need a new kind of presence. Calling the server as a real client showed that an agent alone saw no price. A rule in `CLAUDE.md` and a check against the deployed app now hold that an agent trades only through Live's own action ([`f9fd592`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/commit/f9fd592), [ADR 0096](docs/adr/0096-an-ai-agent-plays-live-through-mcp.md)).

## 6 Testing With People

Scripts cannot tell me whether a room laughs, so family, friends and crit classmates played at the same time.

- My mother, who invests in shares, found that a full-account margin left her nothing to decide. A new order now starts at a quarter ([`e081fb6`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/commit/e081fb6)).
- Bill McAlister, a tutor, suggested in a crit a holding fee that grows with leverage. Real brokers do not charge one. I added it anyway because it makes the lesson sharper: nothing at 1×, and enough at 1000× to drain an account ([`ebe8d53`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/commit/ebe8d53)).

## 7 Choosing Features With RICE

On freeze day I ran Tom Griffiths' product prompts: a PRFAQ, five likely players and forty candidate features scored with RICE ([`2c9810a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/commit/2c9810a), [review](docs/product.md)). The PRFAQ showed that Live depends on a single price source. RICE ranks small, safe changes first, so I also judged each candidate against the README's idea.

- I built two: ESMA's finding that most retail accounts lose, under the bell's leverage replay ([`3bb1853`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/commit/3bb1853)), and a QR code so a showcase crowd can join from phones ([`831600f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/commit/831600f)).
- I rejected seven. A deposit bonus and paid luck scored mid-table but would break the play-money rule.
- When I checked the top of the list against the game, four candidates were already built: the agent had ranked from the documents, not the running app. I now check a ranked list against the app before building from it.
