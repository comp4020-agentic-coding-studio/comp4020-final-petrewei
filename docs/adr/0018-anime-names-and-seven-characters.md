# ADR 0018: Anime Names, and Seven of the Comic's Characters

Status: accepted, 21 October 2026. Changes the drawn names of [ADR 0017](0017-chosen-trader-names.md) and the house traders of [ADR 0015](0015-three-languages-and-the-comics-characters.md); the rest of both stands.

## 1 Context

Drawn names were English word pairs, such as Lucky Pip, the same in every language. The house traders were four characters by given name alone. Peter asked for anime-like drawn names, translated for each language; more of the comic's characters as bots, except the father; and English names of two words, such as Fukuga Kurumi.

## 2 Research

The Japanese and English Wikipedia articles and the anime's site list six characters: Kurumi, Mochiko, Mebuki and Yasuko, who were already bots, and Kurumi's father and mother. A chapter recap of the manga's chapters 45 to 48 adds three more: 酒田いなご, a new hire from the countryside; 善波なな, nicknamed ばなな, who saw Yasuko's losscut at school and calls FX hell; and 月森きずな, three months into a sales job and chasing 1 billion yen. That recap is a fan blog, not an official source.

## 3 Decision

The house traders are now seven, by family and given name in English, each playing her habit: Sakata Inago swarms onto any big move at 400× (500× since [ADR 0024](0024-pause-ironman-and-a-trading-ticket.md)) and flees at the first loss, as her name, the locust of イナゴトレード, says; Zenba Nana only buys, at 1×, and holds; Tsukimori Kizuna adds to every winner. The father is left out as Peter asked, and the mother as `CLAUDE.md` already required. Their Chinese names are the agent's renderings, 酒田稻子, 善波奈奈 and 月森绊, for want of an official translation.

A drawn name is a family name and a given name, family first as the comic writes, from 24 of each in `public/names.js`: 576 names. Most family names are market puns, as the comic's own are: 堂島 for the first futures exchange, 本間 for the man who drew the first candlesticks, 一目 for the cloud chart, 損田 for a loss. Each has a form in each language, Dojima Hikari, 堂島ひかり and 堂岛光, and Chinese forms use no kana. The server still speaks English, and sends each drawn name's pair of numbers alongside, so a page writes it in its reader's language. A drawn name typed in any language is that draw, and all three forms are one person's. A typed name stays as typed. The house traders' given names and the fan nicknames 韭留美 and ばなな are reserved.

## 4 Consequences

- One person reads as 円谷陸 to a Japanese reader, 圆谷陆 to a Chinese one and Tsuburaya Riku in English.
- The three later characters rest on a fan recap. If an official source names them differently, their names change in `public/i18n.js`.
- Existing typed names stand; drawn ones change, since the lists changed.
- `test/names.test.ts` checks the lists, their forms and the bots' names; `test/bots.test.ts` the new habits; `spec/names.test.ts` the draws over the wire; and a new `test/pages.test.ts` parses every page script, because a clash in `app.js` passed every other check and left a blank market.
