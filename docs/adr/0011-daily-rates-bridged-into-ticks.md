# ADR 0011: Daily Rates Bridged into Ticks

Status: accepted, 15 October 2026.

## 1 Context

Peter asked for real history and, where possible, real current prices. Every free source checked gives one reference rate a day, not ticks: the ECB's history since 1999 (free to reuse with credit), Frankfurter's daily API without a key, FRED's noon rates. Paid tick data is out of reach for a student project. A round of three minutes needs about 360 prices, and two famous flash crashes (GBP in October 2016, JPY in January 2019) do not show in daily rates at all.

## 2 Options

- **Daily closes only,** one a tick: honest but jerky, with forty prices a round.
- **A random walk** of synthetic prices: smooth but no longer history.
- **A bridge between real closes:** nine ticks a day of random walk, pinned to land on each real close, opening with most of the move on a day that moved more than 1.5%.

## 3 Decision

The agent proposed the bridge; Peter accepted it with the prototype. Replays use `data/ecb.csv`, the ECB history trimmed to seven currencies, bundled so the app needs no network; crosses such as USD/JPY are derived from the euro rates. A live round fetches today's rate from Frankfurter at most hourly, falls back to the newest bundled day, and simulates forty days on at twice the pair's past-year volatility, with occasional shocks. The page says when moves are simulated.

## 4 Consequences

- Every day's close in a replay is real, and the bell can say so; the path within a day is invented.
- Gaps on big days make stops slip, as they did in 2015, which is the lesson the stop-loss teaches.
- Flash crashes are left out of the events, since the data cannot show them.
- Live rounds are not live prices; the README and page say so plainly. The bundled history needs refreshing by hand if replays should reach past 14 October 2026.
