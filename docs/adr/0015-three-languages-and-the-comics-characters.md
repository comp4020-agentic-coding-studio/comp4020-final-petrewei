# ADR 0015: Three Languages, and the Comic's Characters

Status: accepted, 21 October 2026. Reverses the rule in [ADR 0009](0009-a-parody-fx-trading-floor.md) and `CLAUDE.md` that the game uses no names from the comic; the rest of ADR 0009 stands.

## 1 Context

Peter asked for the site in English, Japanese and Simplified Chinese, using elements of each language, such as the characters' names for the house traders. The comic is Japanese, and its fandom is large in Chinese, where it is 《FX战士久留美》 and its heroine is nicknamed 韭留美, a pun on 韭菜, the retail "leeks" who get harvested. Until now the bots were original parodies (Hana All-In, Rei Glacier, Natsu Shortwell, Mrs Carry), because the parody rule allowed no official names.

## 2 Options for the House Traders

- **Localised parody names:** original characters with a native name in each language; no change to the rule.
- **The official characters:** Kurumi, Mochiko, Mebuki and Yasuko by name in each language's official or fan-standard form.
- **Nods, not names:** original names that wink at the originals.

## 3 Decision

The agent set out all three and recommended the first; Peter chose the official characters. Each plays the habit the comic gives her: Kurumi treats a stop-loss as admitting defeat and goes all in; Mochiko is cold and rational and trades small with tight stops; Mebuki trades so she never has to work, buying the high-yielder for its interest; Yasuko, burned once already, only ever sells. Names follow the Japanese and Chinese Wikipedia and Moegirl: 福賀くるみ and 福贺久留美, 小金萌智子, 山師芽吹 and 山师芽吹, 高根やす子 and 高根安子. Their mottos quote or echo the comic's own lines, such as 「レバレッジあるから大丈夫ぅ♪」, an episode title.

The server keeps speaking English, which the log and the checks read, and sends feed lines and the bell's facts with a key and values. The page translates them from `public/i18n.js` and `public/i18n-long.js`: feed lines by key, refusals by their English text, lessons by id, famous days by date. Terms follow what Japanese and mainland Chinese retail traders say: 決済 and 平仓, 証拠金維持率 and 保证金比例, 追証 and 追加保证金, 強制ロスカット and 强制平仓. Yen is 1,000,000円 in Japanese and 1,000,000 日元 in Chinese, never a bare ¥, which mainland readers take for renminbi. The language follows the browser until the switch in the top bar is used, and is kept in that browser; [ADR 0016](0016-the-address-names-the-language.md) moved it into the address.

## 4 Consequences

- Fans meet characters they know; the site now names a current KADOKAWA series' characters. It uses no art and copies no passage, says on every page that it is an unaffiliated fan parody, and never uses Kurumi's mother or her death.
- `test/i18n.test.ts` fails if any page string, server message, refusal, bot, lesson or famous day lacks a language.
- People's drawn trader names stay English in every language: they are drawn from word lists as identities, not prose. A chosen name may be in any script ([ADR 0017](0017-chosen-trader-names.md)).
- A new server message needs its key in the catalogue, or a page shows its English text; the test catches a missing refusal.
