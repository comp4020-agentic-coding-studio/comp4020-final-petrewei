# Application Boundaries

The [diagram](../public/architecture.svg) shows the same parts at a glance.

## 1 Ownership

`src/server.ts` is the process entry point. `createApp` in `src/app.ts` owns each instance and accepts a clock, data directory, storage factory, price `Feed`, `News` feed and rate fetcher. Importing it opens no socket. Call `start` to listen and await `stop` to release timers and sockets and save pending state. Startup failures release previously registered resources. `ManualClock` drives expiry tests without replacing global timers. Round and portfolio accounting remain separate engines: the Rewind and Random markets in `src/app.ts` on the one-pair desk of `src/fx.ts`, and the Live market in `src/live.ts` on the many-pair book of `src/book.ts`, whose prices come from `src/feed.ts`. Live runs 24/5: open while the FX week is, it trades a quiet currency on its last price for up to two hours. Its news, market headlines from `src/news.ts` with backups in order and the central banks' own words, enters the feed beside players' trades. AI agents trade Live through MCP at `/mcp` (`src/mcp.ts`, ADR 0096): each session is one Live player, and every tool calls Live's own action, the one a page sends.

## 2 Public Contracts and Browser Modules

`public/protocol.d.ts` defines mode-specific state and action contracts. Server projections are checked against them, and `spec/helpers.ts` consumes the same types. `requests.js` constructs typed actions at the browser boundary; `test/page-actions.test.ts` lists every action a page offers and the modes it offers it in, and fails if the builder would drop one. Server validation and authorization remain authoritative.

`account.js`, `chart.js`, `tutorial-ui.js` and `transport.js` own their respective rendering, listeners, timers and stream recovery. Their JavaScript is checked strictly by `tsconfig.browser.json`. The remaining `app.js` coordinates the page and retains legacy UI code; it is not yet entirely typechecked. Cached page navigation suspends the connection and reconnects on restoration, keeping controllers alive. Final disposal removes owned resources.

## 3 Provider Recovery

`quotes.ts` validates and normalizes provider observations; `yahoo.ts` owns network transport. `history-policy.ts` classifies slots as observed, pending, carried or closed. Recent missing trading bars wait for up to one hour. Settled missing bars carry prior prices, including bars absent for every currency, and are charged exactly once. Calendar closures are exempt unless actual historical observations prove trading occurred. Recovery synthesis is bounded to the provider's month. Operator status includes freshness, failures, quality counts and recovery state. Deterministic sparse-feed fixtures exercise the boundary without external services.

## 4 Persistence

`storage.ts` validates each saved file on read and write, writes it through a temporary file and an atomic rename with file and directory synchronisation, and keeps the previous valid copy as `.bak`. The file itself stays the plain JSON it has always been; its format version is a marker beside it, `<file>.version`, so the version before can still read it and a deploy can be rolled back. A file without a marker is migrated on read. A corrupt file is kept as `.corrupt` and restored from the backup. A newer version's file, or corruption with no good backup, stops the server from starting rather than resetting accounts. Validators and migrations live in `saved.ts`. Stop the app before restoring files, and keep a file, its backup and its marker together.

## 5 Verification

Run `pnpm check` against a disposable running server, then `pnpm test:browser` (which owns port 8187). Do not run suites sharing fixed ports concurrently. `pnpm check:evidence` checks process citations. The live check uses the existing read-only guard; participant comprehension still requires real sessions described in `browser-checks.md`.
