# ADR 0049: Jokes on Hover, Definitions Behind an Info Button

Status: accepted, 28 October 2026; its panels break only between clauses by [ADR 0051](0051-tips-break-only-between-clauses.md). Changes the tips of [ADR 0025](0025-tips-and-pictures.md), and the wording of those in [ADR 0046](0046-scenario-is-a-random-simulation.md) and [ADR 0047](0047-simulation-replaces-scenario.md).

## 1 Context

Peter found that a hover tip mixed an explanation with a joke, as in "Leverage: how many times your money you control. Wins and losses grow alike." and "RSI (14): over 70 'overbought'… It can stay there longer than you can stay solvent." He asked for hover tips to be fun and a punchline only, and for any term or concept that needs explaining to have an information symbol at its right, to click or hover for the information.

## 2 Decision

**Two kinds of text.** A hover tip is one short line of voice: a joke, or, on a plain button with nothing to joke about, a few neutral words such as Close the position. A definition is not a tip. A term that needs one carries a small ⓘ button beside its label, and the definition is behind it. Peter chose that plain buttons keep a short neutral tip rather than lose it or be given a forced joke, and that the ⓘ sits beside the label and opens on hover or a tap.

**The info button.** It is a button, circled and small, 26px for a finger. Hovering or focusing it shows its definition in the same floating panel a tip uses; a click or tap pins the panel open, and a second click, Escape or a tap elsewhere closes it, so a phone, which has no hover, can read it. It names itself for a screen reader, About Leverage, and is never inside another button.

**Where.** Leverage, Stake, Net Worth, Open P&L, Margin Level, Name That Year, the spread, the meter's line, the Hall's Avg Score, and, shared, the three indicators, the Stop Loss and Take Profit pair, and the round's pause, leave and end. Replay and Simulation get a joke each and no ⓘ: the tab bar is full, a tab is a button, and the About page already defines them, which Peter chose.

**Words.** Nineteen terms got a new joke and a definition, three shared ⓘ buttons a definition of their own, and twenty-three plain buttons a neutral name, in English, Japanese and Chinese, each in its own voice and not translated word for word. The facts in the definitions were checked against the code: the leverage ladder, the stakes, the log meter, the minimum rounds for the Hall, and the standard deviations.

## 3 Consequences

- A hover tip can no longer be a definition: `test/tips.test.ts` holds every tip to 60 characters in English, 40 in Japanese and 36 in Chinese, checks that none repeats a definition, that every info button has a definition and a name in every language, and that none sits inside another button. The old tips, at 66 to 117 characters, would fail it.
- `test/info.test.ts` checks the button's behaviour: a click opens and a second closes, Escape and a click elsewhere close, keyboard focus shows it, and a plain tip is untouched.
- A page that is open on a phone can now read what a term means, which a hover tip never allowed.
- The panel, anchored above the button, covers the Sell and Buy prices while it is open on a phone; a tap elsewhere closes it.
- A browser check ran a touch context at 390px: the tap opened the definition, which fitted the screen, and a tap away closed it.
