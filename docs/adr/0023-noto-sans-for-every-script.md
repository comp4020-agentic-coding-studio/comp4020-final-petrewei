# ADR 0023: Noto Sans for Every Script

Status: accepted, 22 October 2026. Extends the three languages of [ADR 0015](0015-three-languages-and-the-comics-characters.md).

## 1 Context

Peter found the fonts good on Apple and Android devices and poor on Windows and Linux, especially for Japanese and Chinese, and asked for an open-source font with good support for them, and for Korean later. The pages loaded JetBrains Mono, M PLUS Rounded 1c and Noto Sans SC, then named system fonts. The agent asked Chrome, on Linux, which font drew each element. Prose was in the web fonts. Every Chinese character beside a number, such as 円, 日元 or 秒 in a price, clock or net worth, fell through the mono stack to the system's WenQuanYi Zen Hei, a different design from the text around it; on Windows that slot is MS Gothic or SimSun. Japanese kanji outside M PLUS Rounded's set fell the same way, and nothing covered Hangul.

## 2 Options

- **Name more system fonts:** Microsoft YaHei, Yu Gothic, Malgun Gothic. They vary by machine, are absent on most Linux, and keep the mismatch beside numbers.
- **Self-host one pan-CJK font:** Source Han Sans or Noto Sans CJK in full is tens of megabytes per weight; slicing it ourselves is a build step this project does not have.
- **Noto Sans JP, SC and KR from Google Fonts:** the same open design, under the SIL Open Font License, served in about a hundred slices by character, so a page fetches only the glyphs it shows.

## 3 Decision

The agent chose the third. Every text stack, the mono one included, ends in Noto Sans JP, SC and KR before any system font, and each language puts its own first: a character the scripts share is drawn in Japanese form on Japanese pages and in Simplified form on Chinese ones, and a Korean page, when there is one, takes Noto Sans KR. M PLUS Rounded 1c stays first for Latin and kana, as the app's own voice, and Chinese pages keep Noto Sans SC throughout. Each family loads at 400, 700 and 800. The market, About and README pages take the same link from the server, so they cannot drift.

## 4 Consequences

- On Linux, across every text element of the three market and three About pages, Chrome draws one character from a system font: the ✎ pencil, a symbol.
- A first visit fetched 51 KB of fonts in English, 82 KB in Japanese and 84 KB in Chinese, against 51, 64 and 174 KB before.
- The fonts come from Google. A visitor who blocks it gets system fonts, as before.
- Chrome reports the Noto slices as "Thin" because each is a variable font whose default instance is Thin; it draws the weight the page asks for.
- The browser check also found 全員のラウンドを終了, from [ADR 0022](0022-a-rounds-controls.md), overflowing its button; it is now 全員で終了, and the round's buttons never wrap.
- `test/fonts.test.ts` checks that every stack reaches all three Noto faces before any system font, that each language's comes first, and that every page loads the same fonts.
