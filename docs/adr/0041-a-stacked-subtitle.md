# ADR 0041: A Stacked Subtitle

Status: accepted, 27 October 2026; replaced by [ADR 0043](0043-a-candlestick-icon-and-a-subtitle-at-the-side.md). Replaces the hidden subtitle of [ADR 0040](0040-who-you-are-on-the-first-row.md); the name's place on the first row stands.

## 1 Context

With the subtitle gone on a phone, Peter found the logo a little small and asked whether the subtitle could stay as a line break, "Kurumi's" over "FX Fantasy", and still fit.

## 2 Decision

On a narrow screen the subtitle stays, small, under the logo, which is a good size again. In English it wraps at its space to two lines no wider than the logo, "Kurumi's" over "FX Fantasy". Chinese is short enough to stay on one line. Japanese breaks after its の, as くるみちゃんの over FXファンタジー: a first try with a width alone split ファンタジー across three lines, and one without a break left the brand too wide for the name. Peter chose that break and that Japanese call Kurumi くるみちゃん, as the comic does, so the Japanese title is now ロスカット！ くるみちゃんの FXファンタジー in the page title, the heading and the About page. The Japanese and Chinese logos are a little smaller on a phone, since their glyphs are wider than Losscut! at one size.

## 3 Consequences

- At 360px the brand is 85px wide in English and Chinese and 90px in Japanese, so a Chinese name of six characters shows in full; a name of nine letters in English, a Japanese name of four or more characters, and any long one are cut with an ellipsis.
- The header is two rows on a phone, a little taller than with the subtitle hidden.
- `test/tips.test.ts` checks that the narrow rules stack the brand and cap the subtitle and that the Japanese subtitle is the one named; `spec/languages.test.ts` the new Japanese title on the market and About pages.
- A browser check measured each line of the Japanese subtitle, and first found the break landing after ちゃん, stranding the の.
