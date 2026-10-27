# ADR 0047: Simulation Replaces Scenario

Status: accepted, 28 October 2026; its tab bar widened by [ADR 0048](0048-room-for-the-longest-tab.md). Renames the tab of [ADR 0027](0027-scenario-replaces-live.md), whose wording [ADR 0046](0046-scenario-is-a-random-simulation.md) had already changed.

## 1 Context

After the wording of the tab changed to a random simulation, Peter asked whether its name should change too. Scenario still suggests a prepared setup, which is what ADR 0046 took out, while Simulation says what it is and sets itself against Replay: real days against simulated ones. It matches the Chinese tab, 模拟, the reveal line, and the code, which marks these rounds simulated.

## 2 Decision

**English and Chinese.** The tab is Simulation in English and 模拟 in Chinese, with its lobby title, mode line, tip, feed line, About text, footer and tutorial closing words to match. The mode's id is `simulation` in the server, the page, the address, the saved tab and the counts of people on each tab.

**Japanese.** The tab stays シナリオ. The full シミュレーション is eight characters and is cut off in the tab bar on a phone under about 430px, where it needs 116px of 99 or 109; 模擬相場 was offered and Peter chose to keep シナリオ, which the lines beside it, シミュレーション and ランダム, now explain.

**Old names.** Scenario, Live and History still lead to their tabs, as the two earlier renames did: in the address (/#scenario), in a tab a browser saved, and in the server's mode parameter, so a bookmark or an open page from before keeps working. The saved value is rewritten to the new name.

**Left as it was.** The situations a round is shaped by, a peg break, a bubble and the rest, and the function that draws a round, keep the name scenario: that is the template, not the tab, and a rename would change code for no one's benefit.

**Phone tabs.** Simulation is ten letters against Scenario's eight and was cut off at 360px by five pixels, so on a phone the tab font and padding are a little smaller. That also stopped Japanese チュートリアル being cut off there, which it had been.

## 3 Consequences

- The three tabs read Replay, Simulation and Tutorial, and 回放, 模拟 and 教程, and fit at 360px in English, Japanese and Chinese. English still clips at 320px.
- A bookmark or open tab from before the rename needs no change.
- `test/tips.test.ts` checks the mode id and the old names in the page and the server, the three languages' tab names, and that no English or Chinese text calls the tab Scenario; `spec/modes.test.ts` that the server takes live and scenario as simulation.
- A browser check measured the tabs at 320 to 390px in three languages, which found the English clip that the Japanese measurement had not, and checked that a saved tab of scenario or live, and the addresses #scenario and #live, land on Simulation.
