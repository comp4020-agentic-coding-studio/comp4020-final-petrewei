# ADR 0010: Who May See and Change What

Status: accepted, 15 October 2026 (crit 10). Replaces [ADR 0007](0007-who-may-see-and-change-what.md) for the trading floor; its decision to keep the log to the operator carries over.

## 1 Context

Crit 10 asks that what each person may see and change is checked on the server, and written down. There are no accounts: a person is the random cookie the server hands out. A trading floor raises two questions the fridge did not: what a trader may see of others' positions, and whether anything a page sends can move money it should not.

## 2 Options for Others' Positions

- **Nothing but a ranking:** private, but the room cannot react to a rival going 1000× long, which is most of the fun.
- **Everything, stops included:** the room could hunt a trader's stop, a real tactic but not one a player can defend against here.
- **Side, leverage and net worth, not stops:** the room sees the bets, not the exits.

## 3 Decision

The agent proposed the third; Peter accepted it with the game. Every rule below is checked on the server, because a page's code is in every visitor's hands.

| Who | May see | May change | Checked by |
| --- | --- | --- | --- |
| Any visitor | the round's prices so far, never its dates before the bell; every trader's name, side, leverage and net worth; the feed; the hall of fame | their own account only, by orders the broker offers: buy or sell at a listed leverage and a stake between 0 and 1, close, set a stop on the right side of the price, pray, and borrow only when broke | `spec/permissions.test.ts`, `test/fx.test.ts` |
| A trader | their own balance, position, entry, margin level, stop and debt | the same | `spec/permissions.test.ts` |
| The operator, with `STATS_KEY` | the activity log in `/data/activity.log`: every person's action by short code and trader name | nothing more than any visitor | `spec/log.test.ts`, `test/log.test.ts` |

Prices, fills, margin calls and stop-outs happen on the server's clock at the server's price; a page cannot send a price. A request body over 1 KB is refused. The key is a Fly secret compared in constant time; without it `/log`, `/log.js` and `/api/log` answer 404. The bots' trades go to stdout but not to the saved log, so the crit's narration shows people.

## 4 Consequences

- Two classmates in separate profiles are two short codes and two trader names in the log, and neither can touch the other's account.
- A trader's name is drawn from their cookie, so two people can share one; the short code tells them apart in the log and the hall of fame.
- A visitor who copies another's cookie becomes them. Nothing here is worth more than play money, so this is accepted.
- The crit 10 demo is narrated from `/log?key=…` or `flyctl logs`; the key must not be shown to the room.
