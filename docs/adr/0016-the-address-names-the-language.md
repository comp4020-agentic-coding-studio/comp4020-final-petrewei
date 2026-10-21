# ADR 0016: The Address Names the Language

Status: accepted, 21 October 2026. Changes how [ADR 0015](0015-three-languages-and-the-comics-characters.md) picks the language; the rest of it stands.

## 1 Context

The address carried the market (`/#live`), and the language followed the browser and was kept in it, so a link could not open the Japanese page. The Japanese brand also read "Losscut! ロスカット" whatever the language. Peter asked for a logo in each language, the language in the address instead of the market, people in every language still playing in the same rooms, the bare address as the home page, and an About page in all three languages.

## 2 Options

- **Where the language goes:** a path (`/ja/`, `/zh/`), a query (`/?lang=ja`), or the hash (`/#ja`). A path gives each language its own page that a search engine and a shared link can name; a query or hash is only read once the page runs.
- **What About is:** a page for players, or the course README served under a new name.
- **The Chinese logo:** 爆仓！, the mainland word for a wiped-out account, or 强制平仓！, the broker's formal term, or the English logo kept.

## 3 Decision

Peter chose all three: the path, a player's About page, and 爆仓！. English stays at `/`, with no tag; Japanese is `/ja/`, Chinese `/zh/`, and `/ja` and `/zh` redirect to them. About is `/about`, `/ja/about` and `/zh/about`. The logos are Losscut!, ロスカット！ and 爆仓！, and the subtitle after each is the language's own. Later the same day Peter retitled the Chinese site 强制平仓！久留美的FX白日梦: the broker's formal term, which the losscut stamp already used, and 白日梦, a daydream, for the subtitle; Chinese sets no space after the full-width ！.

The server fills `public/index.html` for each language before it is sent, so the page arrives with its `lang`, title, logo and links in place and no flash of English. Each page lists the others with `hreflang`. The language menu loads the other address. The chosen market tab moves to the browser's storage, and an old `/#live` link still opens Live once, then the address loses its hash. Rooms are by market only, so the language never reaches the server's rooms, orders or feed.

About is written for players, not the course: the three tabs, how a round goes, leverage and the losscut, the shared rooms, what the parody is and is not, where the prices come from, and the help line. It lives in `public/about.js`; the server renders it. The README stays at `/readme/`, linked from About.

## 4 Consequences

- A link names its language, and a player can share `/ja/` with a Japanese friend who lands in the same room as them.
- The tab is no longer in the address, so a link cannot open Live directly; the last tab used in that browser opens.
- Logos differ in width, so the brand slot holds the widest, ロスカット！, on one line; on a phone the logo shrinks to fit. A browser check measured every panel at five widths and found them identical across the three languages.
- `spec/languages.test.ts` checks each address, the redirects, the logos, the About pages and their alternates; `test/i18n.test.ts` budgets the logo's width.
