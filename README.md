# Losscut! Kurumi's FX Fantasy

Two shared currency markets, chosen by tab, traded by everyone at once with play money. A round is three minutes of forty trading days, started by anyone on its tab, in [English](https://comp4020-final-petrewei.fly.dev/), [日本語](https://comp4020-final-petrewei.fly.dev/ja/) or [中文](https://comp4020-final-petrewei.fly.dev/zh/). On History the dates are hidden: you might be long francs on 15 January 2015 and not know until the bell.

Good, defined.

## Who it is for

A crit group, or the showcase. It parodies *FX Fighter Kurumi-chan* (Demunyan and Daisuki Tansan; anime by Passione, 2026), in which a student trades leveraged forex to win back what her mother lost in 2008: funny and grim, like this game.

## What good means here

- **Everyone on a tab trades one price, in one room.** The server owns the price and fills; everyone sees your side, leverage and net worth.
- **History is the dealer** ([ADR 0012](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/blob/main/docs/adr/0012-history-and-live-as-tabs.md)). It replays the European Central Bank's daily rates since 1999; most rounds hide a famous day, such as Lehman Brothers or the franc's unpegging, revealed at the bell. Live simulates from today's real rate.
- **Leverage is the joke, and the lesson.** From 1× to offshore 1000×, past Japan's 25× and Australia's 30× caps. A margin call comes at 50% margin level; a stop-out (強制ロスカット) at 20% ends your round, unless you borrow. A gap can wipe you out in one tick.
- **Losing is public.** Stop-outs hit the feed; Dad lends twice, as debt.
- **There's always someone to trade against.** Seven of the comic's traders play every round; Kurumi never cuts a loss.
- **Beginners get a tutorial** ([ADR 0013](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/blob/main/docs/adr/0013-a-private-tutorial.md)): twelve lessons, one move each.
- **There's a short game and a long game.** Rounds rank by percentage; a hall of fame keeps results.

## Enforced and judged

Checked in `spec/` and `test/`:

- an order reaches every page on its tab within a second
- a round waits for a Start; only its starter may end it, and anyone may pause it unless ironman ([ADR 0022](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/blob/main/docs/adr/0022-a-rounds-controls.md), [0024](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/blob/main/docs/adr/0024-pause-ironman-and-a-trading-ticket.md))
- the server refuses orders its broker does not offer, and acts only on the sender's account
- nobody is shown another person's cookie or stop, or their tutorial
- a chosen name is plain text, and nobody else's ([ADR 0017](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/blob/main/docs/adr/0017-chosen-trader-names.md))
- margin calls, stop-outs, zero-cuts, slipping stops and loans follow `src/fx.ts`
- replays pass every real close; indicators match formulas
- simultaneous actions all land ([ADR 0014](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/blob/main/docs/adr/0014-simultaneous-actions.md))
- who did what is logged by short code, surviving hard kills
- every string has English, Japanese and Chinese, each with its own address and About page ([ADR 0016](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/blob/main/docs/adr/0016-the-address-names-the-language.md))

Judged by people, at the crit and showcase:

- whether a room laughs and learns when the bell rings
- whether leverage looks as dangerous as it is
- whether the Japanese and Chinese read as native

## What I looked at

- [*FX Fighter Kurumi-chan*](https://en.wikipedia.org/wiki/FX_Fighter_Kurumi-chan), its [anime site](https://fxkurumi-info.com/) and Japanese and Chinese wikis, for names, terms, colours ([ADR 0015](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/blob/main/docs/adr/0015-three-languages-and-the-comics-characters.md), [0018](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/blob/main/docs/adr/0018-anime-names-and-seven-characters.md)); the pixel faces are hand-drawn ([0021](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/blob/main/docs/adr/0021-pixel-faces.md)).
- The ECB's [euro reference rates](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html) (source: ECB; crosses derived) and [Frankfurter](https://frankfurter.dev/) for today's rate.
- ESMA's [2018 restriction on retail CFDs](https://www.esma.europa.eu/press-news/esma-news/esma-agrees-prohibit-binary-options-and-restrict-cfds-protect-retail-investors): 74–89% of retail accounts lose money; major pairs capped at 30:1.
- After the franc unpegged, FXCM's clients owed it [$225 million](https://money.cnn.com/2015/01/16/investing/swiss-currency-fxcm/index.html).
- Clay Shirky, ["Situated Software"](https://gwern.net/doc/technology/2004-03-30-shirky-situatedsoftware.html) (2004): software for one group.

## Left out

Real money, broker links, deposit offers, the series' music or art ([ADR 0020](https://github.com/comp4020-agentic-coding-studio/comp4020-final-petrewei/blob/main/docs/adr/0020-optional-background-music.md)). The comic's family tragedy is the premise, not a joke. If gambling or debt is hurting you, the [Gambling Help](https://www.gamblinghelponline.org.au/) line in Australia is 1800 858 858.
