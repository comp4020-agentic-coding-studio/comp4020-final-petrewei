# ADR 0024: Pause, Ironman, and a Trader's Ticket

Status: accepted, 22 October 2026. Adds to a round's controls in [ADR 0022](0022-a-rounds-controls.md); changes the leverage menu behind [ADR 0009](0009-a-parody-fx-trading-floor.md) and the wording of [ADR 0015](0015-three-languages-and-the-comics-characters.md).

## 1 Context

Peter asked for a pause anyone can press mid-round, and an ironman switch at the Start that disables it. He asked for percentages beside amounts, saying they matter more to him; a meter that shows profit, not only loss; a 75% stake; Australia's legal cap on the leverage menu, and 500× in place of 400×; sliders for leverage, on a log scale, and stake, evenly. He pointed at the order preview, "Puts in ¥250,000 to control ¥6,250,000. A 4% move against you loses all of it.", whose last words wrapped alone, and at prose broken mid-sentence on the footer and About pages. He asked that Japanese and Chinese be written as their own readers would write them, not after the English, and that the About page carry the full title.

## 2 Decision

**Pause.** Peter chose that anyone on the tab may pause or resume a trading round, and that a pause ends by itself after a minute, so nobody can hold a room. A pause freezes the price, the bots and every order for everyone, and veils the chart with a Resume button and the seconds left; the starter may still end the round, and anyone may still leave, at the frozen price. **Ironman** is a box under Start: that round cannot be paused, and the next is ordinary unless it is ticked again.

**Leverage** is a ladder, as Peter chose: 1, 2, 5, 10, 25, 30, 50, 100, 200, 500 and 1000×, with Japan's retail cap of 25× and Australia's 30× on major pairs. The slider is logarithmic and snaps to the nearest rung; its ticks name the ends and, in one label, both caps, which sit a hair apart. Bets of 200× and over are now the room's business, in red and a bubble, where 400× was. The bots that bet 400× bet 500×. **Stake** is an even slider of 25, 50, 75 and 100%.

**Percentages.** Net worth shows its change from the start; open P&L its change on the margin put up; the bell ranks by the percentage, bold, with the yen after; the hall gains an average result per round, as a percentage of the start, so one lucky round and twenty steady ones compare. A tiny move is never shown as zero.

**The meter** is net worth against the start, centred on ±0: a loss runs left in red and profit right in green, on a log scale where halving and doubling are the same distance. With a position open, it marks where the margin call and the losscut would land: at half and a fifth of the margin. Any change shows at least a sliver, since a log scale hides small moves.

**Wrapping.** The preview is two short phrases, one to a line, with amounts that never break. Japanese and Chinese break by phrase where the browser can (`word-break: auto-phrase`, Chrome only, Japanese only) and never begin a line with 。、ー or a closing bracket (`line-break: strict`); prose avoids a lone last word (`text-wrap: pretty`). Other browsers fall back to their defaults.

**Writing.** The agent rewrote the Japanese and Chinese About pages, footer and lobby in each language's own voice: a Japanese game's help page, in です・ます, and a Chinese 玩法说明, using traders' own words such as 追保, 强平 and 爆仓, rather than sentence for sentence after the English. Facts, safety lines and help numbers are unchanged. The About page's heading is the full title in each language.

## 3 Consequences

- A paused room waits at most a minute; an ironman room cannot wait at all.
- 25× and 30× sit about 2% of the slider apart; the snap makes each reachable, and the label says which is which.
- The pure arithmetic, the slider scales, percentages and the meter, lives in `public/ticket.js`, checked by `test/ticket.test.ts`; `test/rounds.test.ts` checks pause, auto-resume and ironman; `test/fx.test.ts` the ladder; `spec/languages.test.ts` the phrase wrapping, the full title, and that every module a page imports is served.
- That last check exists because the first browser run found `ticket.js` unserved, a blank market that every other check had passed.
- Chinese may still break between two characters of a word; that is how Chinese is set, and `auto-phrase` does not yet cover it.
