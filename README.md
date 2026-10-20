# Losscut! Kurumi's FX Fantasy

Two shared currency markets, chosen by tab, traded by everyone at once with play money. A round is three minutes of forty trading days, started by anyone on the tab. On History the dates are hidden: you might be long francs on 15 January 2015 and not know until the bell.

A working definition of good.

## Who it is for

A room at once: a crit group, or the showcase. It parodies *FX Fighter Kurumi-chan* (Demunyan and Daisuki Tansan; anime by Passione, 2026), in which a student trades leveraged forex to win back what her mother lost in 2008: funny and grim at once, like this game.

## What good means here

- **Everyone on a tab trades one price, in one room.** The server owns the price and fills each order on arrival; everyone sees your side, leverage and net worth.
- **History is the dealer** ([ADR 0012](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/blob/main/docs/adr/0012-history-and-live-as-tabs.md)). It replays the European Central Bank's daily rates since 1999; most rounds hide a famous day, such as Lehman Brothers, Brexit or the franc's unpegging, revealed at the bell. Live starts from today's real rate and simulates from there.
- **Leverage is the joke, and the lesson.** From 1× to 1000×, as offshore brokers allow. A margin call comes at 50% margin level, a forced stop-out (強制ロスカット) at 20%. A gap can wipe you out in one tick, and a stop fills where the price lands.
- **Losing is public.** Margin calls and stop-outs go to the feed. A broke player may borrow from Dad's savings twice, counted against them.
- **There's always someone to trade against.** Four house traders, each parodying a habit, play every round.
- **Beginners get a private tutorial** ([ADR 0013](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/blob/main/docs/adr/0013-a-private-tutorial.md)): twelve lessons, one idea and one move each.
- **There's a short game and a long game.** Each round ranks net worth; a hall of fame keeps profit and busts across rounds and restarts.

## Enforced and judged

Checked in `spec/` and `test/`:

- an order reaches every other page on its tab within a second, with no reload, and never the other tab
- a round waits for a Start from someone on its tab, then the price moves twice a second
- the server refuses orders the broker does not offer, and acts only on the sender's account
- nobody is shown another person's cookie or stop, or their tutorial
- margin calls, stop-outs, zero-cuts, slipping stops and loans follow `src/fx.ts`
- replays pass through every real daily close, gap on big days, and hide each event mid-window
- simultaneous actions all land ([ADR 0014](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/blob/main/docs/adr/0014-simultaneous-actions.md))
- who did what is logged by short code and request, and survives a hard kill

Judged by people, at the crit and showcase:

- whether a room laughs and learns when the bell names the date
- whether it makes leverage look as dangerous as it is

## What I looked at

- [*FX Fighter Kurumi-chan*](https://en.wikipedia.org/wiki/FX_Fighter_Kurumi-chan) and its [anime site](https://fxkurumi-info.com/); no art, names or text are used.
- The ECB's [euro reference rates](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html) (source: ECB; crosses derived) and [Frankfurter](https://frankfurter.dev/) for today's rate.
- ESMA's [2018 restriction on retail CFDs](https://www.esma.europa.eu/press-news/esma-news/esma-agrees-prohibit-binary-options-and-restrict-cfds-protect-retail-investors): 74–89% of retail accounts lose money; major pairs capped at 30:1.
- After the franc unpegged, FXCM's clients owed it [$225 million](https://money.cnn.com/2015/01/16/investing/swiss-currency-fxcm/index.html).
- Clay Shirky, ["Situated Software"](https://gwern.net/doc/technology/2004-03-30-shirky-situatedsoftware.html) (2004): software for one group, not for scale.

## Left out

Real money, broker links and deposit rewards. The comic's family tragedy is the premise, not a joke here. If gambling or debt is hurting you, the [Gambling Help](https://www.gamblinghelponline.org.au/) line in Australia is 1800 858 858.
