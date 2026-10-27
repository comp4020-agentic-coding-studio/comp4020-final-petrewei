# ADR 0046: Scenario Is a Random Simulation

Status: accepted, 28 October 2026; the tab renamed by [ADR 0047](0047-simulation-replaces-scenario.md). Rewords the Scenario tab of [ADR 0027](0027-scenario-replaces-live.md); the market it draws is unchanged.

## 1 Context

Peter found that the word script, used for the Scenario tab, made it look as if everything in it were fixed, and asked for the simulation and the randomness to be emphasised instead. He also asked that the Chinese name of the tab not be 剧本, which is a script. The code agrees with him: each day's move is drawn at the pair's real volatility over the past year, the day the market turns is drawn, and the direction is a coin toss. Only the kind of market, a peg break, a bubble, a choppy day, is a template, and that is shaped, not scripted.

## 2 Decision

**Words.** Nothing a player reads calls Scenario a script. It is a simulated market from today's real rate, drawn at random, shaped by a situation the player is not told until the bell, and every round is drawn afresh. The lobby says 40 simulated days, random each time; the mode line says simulated from today's rate, drawn at random; the feed's opening line says the situation is hidden until the bell; the About pages, the footer, the tab's tip and the tutorial's closing words say the same. The Japanese 筋書き, which is a plot, is gone for the same reason, and the English headlines and the reveal, which already said simulated, are unchanged. The Tutorial, whose prices really are fixed, is still called scripted.

**Chinese.** The tab is 模拟, a simulation, which Peter chose over 情景 and 推演. The lobby reads 模拟模式等待中, the mode line 模拟：从今天的汇率出发，每局随机生成, and the hidden side is 情形, a situation, not 剧本. Japanese keeps シナリオ, the loanword, now explained by シミュレーション and ランダム in the lines beside it.

## 3 Consequences

- A player reading any language is told that Scenario is random and that the next round will not repeat the last.
- The English line the server sends when a round opens changed with its translations, which the translation test requires to match.
- `test/tips.test.ts` fails if script, 剧本, 脚本, 筋書き or 台本 returns to the page's text, tips, About pages or scenario text, except in the Tutorial's mode line, and checks that the Chinese tab is 模拟 and that the English lobby and About text say random.
- A browser check read the Chinese tab bar, lobby and mode line, and a lobby line that was too long for one line was shortened rather than the test loosened.
