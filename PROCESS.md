# Process Overview

## 1 From the Brief to a Game

The brief asks for a multi-user, real-time website that is good, and leaves what "good" means to me. For crits 8 and 9 the app was Fridge Poetry, a shared door of word magnets where each word exists once ([ADR 0001](docs/adr/0001-plain-node-and-a-json-file.md) to [0008](docs/adr/0008-rounds-with-a-prompt.md)). It met every spec, but after crit 9 I judged it neither playable nor competitive. Scored rounds with prompts ([`4c5f328`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/commit/4c5f328)) did not change that, and nor did a fast letter race the agent built on a branch ([`c6fa7a1`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/commit/c6fa7a1)): I don't find word games fun, and I told the agent the fridge mattered less than multiplayer.

I asked it to read classmates' work before proposing more. It surveyed about 125 projects across six crit groups: co-op, arenas, racing and card games were crowded, and nobody had built a market. I said I was interested in strategy games and live markets, and twice had to correct it for combining the two when I meant either. Then I proposed my own idea: a shared foreign-exchange market on real or simulated prices, where players compete by prediction and leverage, parodying *FX Fighter Kurumi-chan*. I asked for mainstream currencies, hidden-date replays of crises such as 2008 and the 2015 franc unpegging, and a mode from today's real price. I played the prototype, found it fun, chose to replace the fridge with it ([`66449d4`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/commit/66449d4), [ADR 0009](docs/adr/0009-a-parody-fx-trading-floor.md)), and named it Losscut! Kurumi's FX Fantasy, after weighing the agent's suggestions.

## 2 Stack and Harness

The stack outlived the switch: plain Node with no dependencies, server-sent events, and state on the Fly volume ([ADR 0001](docs/adr/0001-plain-node-and-a-json-file.md)). One process owns the price, the accounts and the clock, so a round is a loop over ticks.

The harness has three parts that are meant to agree. `README.md` argues what good means and lists which claims are enforced and which are judged. Before choosing the game I had `CLAUDE.md` cut to rules alone ([`4269d0a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/commit/4269d0a)), since project facts belong in the README and the brief belongs on the course site; the switch added rules for the theme: play money only, no official art, and satire aimed at habits, never at the people they hurt. `spec/` checks the running app, and `test/` holds the rules modules on an injected clock and a seeded generator. The trading rules' thirteen tests were written before `src/fx.ts` ([`8c98e74`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/commit/8c98e74)).

## 3 Grounding the Game in the Real Thing

I asked the agent to research forex and the comic rather than guess. Two subagents ran in parallel: one fetched and tested free data sources, the other read the comic's coverage and real broker rules. The first found that every free source is daily, so the agent proposed bridging real daily closes with nine ticks of pinned random walk, gapping on big days so stops slip ([ADR 0011](docs/adr/0011-daily-rates-bridged-into-ticks.md)). A replay's closes are all real, and the bell can name the date. The second supplied the broker rules the desk uses, such as Japan's 25× cap and offshore 1000×, and tone guidance from reviews, which the agent turned into the README's "Left out".

Partway through I asked whether it had used the official anime site. It hadn't; it read the site, took only the general look of a trading terminal and the 強制ロスカット gag, and reworded a bot's motto it found was close to an episode title. I questioned "Losscut" as English. The agent said it is Japanese broker usage, while English says stop-out or liquidation, and I kept it.

## 4 Corrections

The prototype passed its tests, but the browser checks found what they could not. A 1000× bust left me with nothing to do for three minutes, so the agent proposed borrowing from Dad's savings: back in the game but never ahead, since the debt comes off the result ([`2905ec8`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/commit/2905ec8)). The next run showed a stop-out could leave a player with ¥27,676 and still locked out, because only a zero balance could borrow; the rule became "broke", with a test. The same run caught the stream dropping, because every tick resent the whole price history. Ticks now carry only the new price, and a round number lets a page that missed one ask again.

Some corrections were to the agent's tests rather than the code. Its first borrowing test expected a second loan without busting twice. When a stop-out scenario failed three times, it stopped guessing prices and worked out the arithmetic, and found it had misread its own spread constant. A spec check for hidden replay dates flagged "carry" in the name of a bot, Mrs Carry, so the check now looks for the events' names. After the switch I ran `/simplify`, and four parallel reviews found where the prototype guessed at what the server knew: the page detected its own stop-out from a balance drop and the feed's wording, and the log reused "open" for both a page and a position. Both now come from the server ([`d654f9f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/commit/d654f9f)). `/code-review` then found the refactor's own costs, such as a name cache that grew with every cookie, and I had them fixed ([`f6d1e25`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/commit/f6d1e25)).

## 5 Several People at Once

Co-presence is the game: one price, one feed of margin calls and stop-outs, one ranking, and the bell's reveal is something the room hears together. `spec/realtime.test.ts` holds the brief's bound: a trade reaches another page within a second. Four house bots, each parodying a retail habit, make a round worth playing alone. In one test round of the 2024 yen unwind, the perma-short bot won and the carry trader was wiped out, with nothing scripted.

## 6 Who May See What, and the Log

For crit 10 the server decides everything ([ADR 0010](docs/adr/0010-who-may-see-and-change-what.md)): a page sends only a choice, never a price, and acts only on its own account. Others' side, leverage and net worth are public, since the room reacting to a 1000× long is most of the fun; stops are not, so nobody can hunt them. Every person's action is logged by short code and trader name, to stdout for `flyctl logs` and to the volume, behind the operator key carried over from the fridge ([ADR 0007](docs/adr/0007-who-may-see-and-change-what.md)). Bots' trades stay out of the saved log so the crit narration shows people. The log and the hall of fame survive a hard kill, which `test/log.test.ts` checks.

## 7 What Is Still Open

Whether a room laughs and learns at the bell is for the crit and showcase to judge. Quiet replays are dull, since a day only moves as far as it really did. The bundled history ends on 14 October 2026.
