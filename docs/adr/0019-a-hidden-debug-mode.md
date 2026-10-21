# ADR 0019: A Hidden Debug Mode

Status: accepted, 21 October 2026. Extends the operator's row of [ADR 0010](0010-who-may-see-and-change-what.md).

## 1 Context

Testing a margin call, a losscut or the bell meant trading a 1000× position until the market obliged, or waiting out a three-minute round; resetting the hall of fame meant an SSH command only Peter can run. Peter asked for a hidden debug mode and a console for such things, starting with resetting the hall. The app is public and its rooms are shared, so a console that resets the hall or ends a round must be the operator's alone.

## 2 Options

- **A page-side switch:** `?debug` shows the console to anyone who knows it; the server would still have to check every action, so the switch hides nothing worth hiding.
- **A separate admin page:** like `/log`, gated by the key in each request, but away from the market the operator wants to test.
- **The operator's key, turned into a cookie:** the market page itself gains the console, and the server checks a cookie on every action.

## 3 Decision

The agent chose the third. Opening any market page with `?debug=KEY`, where KEY is `STATS_KEY`, sets a `dbg` cookie for a day: the visitor's id signed with the key. It is never the key, works for that visitor alone, and stops working when the key is rotated. The page drops `?debug` from the address at once, so the key is not left in the bar, a bookmark or the history; `?debug=off` clears the cookie. With no key set, debug mode cannot be turned on.

Only a debugger's page loads `/debug.js`; to anyone else it, and `/api/debug`, answer 404. The backtick key, or a DEBUG tag in the corner, opens the console. Its actions run on the server, where the rules are, and change only what they name: reset the hall of fame (after a confirmation); start a round now, end it at the bell, or send it back to the lobby; put the debugger's own position in a margin call or a losscut; reset the debugger's own money. A margin call or losscut is made by moving the debugger's own entry until their margin level is 40% or 10%, then letting the desk's rules act on that account alone, so the shared price, and every other player, are untouched. A status panel shows each room's phase, pair and, for the operator, the replay's hidden dates and event. Every debug action is logged with the debugger's short code.

## 4 Consequences

- A margin call, a losscut, the bell and a reset take a click instead of luck, and the hall resets without SSH.
- Ending or restarting a round on the live app ends it for everyone in that room: the console is for an empty room or a throwaway server.
- The status panel shows a replay's hidden dates and event; the operator should not share their screen with it open during a round.
- `test/debug.test.ts` checks that only the key turns debug on, that a forged or another's cookie is refused, and each action; `test/fx.test.ts` that rebasing one account moves no price and no one else. A race in the test helper, where the next test's server could answer from the last while it died, was fixed by waiting for the old process to exit.
