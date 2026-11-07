# Browser Checks and a First-Round Playtest

## 1 Automated Checks

Install dependencies with `pnpm install --frozen-lockfile`, then install Chromium once with `pnpm exec playwright install chromium`. On a fresh Linux runner, use `pnpm exec playwright install --with-deps chromium` to install its system dependencies too. Run `pnpm test:browser`.

The checks cover English, Japanese and Chinese at 1920 × 1080 and 390 × 844. They exercise the welcome screen, tutorial, keyboard leverage changes, the phone's fixed Close control, two independent visitors seeing one order, going offline and reconnecting to the same account, and each visitor receiving only their own debrief. Browser errors fail the check. CI runs these before deployment.

The runner starts its own server on port 8187 with a fresh temporary data directory and a faster game clock. It refuses to reuse an existing server, cannot target the public market, and removes its data on shutdown. It closes its browsers after the run. Failure context is written under the ignored `output/playwright/` directory; delete it after investigating. The existing `pnpm check` remains the rule and HTTP contract suite.

## 2 Session With Three New Players

Allow about fifteen minutes per player. Use the player's preferred language. Include at least one phone and one desktop session. Record observations using Player A, B and C rather than real names. Explain only that this is a game using play money; give no trading instructions beforehand. Let the player choose the tutorial if they want it.

Give these tasks one at a time:

1. “Join the game and start playing.” Observe their first choice and where they hesitate.
2. “Open a position, then close it when you choose.” Record whether they find both controls without help.
3. “Before the next trade, tell me what changing leverage would do.” Record their explanation before correcting anything.
4. “Finish a round and tell me what happened to your money and score.” Note whether they use the reveal and their personal breakdown, and whether they distinguish loan deductions from score penalties.
5. “What would you try differently in another round?” Record their answer in their own words.

If they get stuck, record the point and the help you gave. A task completed after a hint is an assisted completion. After the tasks, explain any misunderstood game rule and ask which moment was most enjoyable or confusing.

## 3 Observation Sheet

No sessions have been conducted for this change. Fill these rows from observation; automated checks cannot establish comprehension or enjoyment.

| Observation | Player A | Player B | Player C |
| --- | --- | --- | --- |
| Language and screen size | | | |
| First choice: tutorial or free play | | | |
| Open and close: independent / assisted / incomplete | | | |
| Explanation of leverage | | | |
| Explanation of money and score | | | |
| Longest hesitation and any help given | | | |
| Enjoyable or confusing moment, in their words | | | |
| One change supported by this session | | | |

Choose the next interface change from repeated observations, then repeat the affected task with someone new.

## 4 Facilitator Preparation and Decision Rules

Recruit three new players, including a phone user and a desktop user. Ask permission to take anonymous notes and explain that they may stop at any time. Use a disposable local game, not shared production accounts. Prepare the preferred language and record the device, viewport, date and build before each session. Do not collect names or financial information.

Use the five tasks above in order. Allow up to two minutes of independent exploration per task before offering a hint; record the hint verbatim and mark that completion assisted. Ask for leverage and score explanations before giving corrections. A correct leverage explanation mentions that both gains and losses grow and that a small adverse move can force a close. A correct result explanation distinguishes account money, outstanding debt and score penalties. Record partial understanding rather than forcing a yes/no answer.

After all three sessions, group repeated difficulties, retain a short anonymous quotation supporting each finding, and choose the most consequential issue seen by at least two players. A serious inability to close a position deserves investigation even if observed once. Record the proposed change, evidence and acceptance task; repeat that task with a new participant after implementing it. The observation table remains blank until real sessions occur.
