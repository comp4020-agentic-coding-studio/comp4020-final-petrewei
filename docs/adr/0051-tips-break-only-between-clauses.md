# ADR 0051: Tips Break Only Between Clauses

Status: accepted, 28 October 2026. Refines the tips of [ADR 0025](0025-tips-and-pictures.md) and the definitions of [ADR 0049](0049-jokes-on-hover-and-an-info-button-for-terms.md).

## 1 Context

Peter did not like a line breaking in the middle of a sentence in a tip, and asked that a tip be either one line, or break after a full stop or a comma. A tip was a box of a fixed width, which wrapped wherever its text ran out.

## 2 Decision

**A tip is made of clauses.** The text is cut after . , ; : ! ? and after the Japanese and Chinese 。，、；：！？, and each clause is one unbreakable piece. A line can therefore end only between two clauses. A mark ends a clause only where a space or the end of the text follows it, so 1.5% and ¥1,000,000 stay whole, and in Japanese and Chinese, which have no spaces, always. The panel is as wide as its text up to 36rem, so most tips are one line.

**The copy had to change, not only the style.** A clause that cannot be broken must fit one line, and on a 360px phone that is about 331px, or 53 average English letters. A measurement of all 509 clauses in the three languages found 23 too long for the earlier 45-character guess, and, in the browser, one that overflowed the real panel: Stop Loss closes the trade if the price goes this far against you. Long definitions were rewritten to end at a comma or a full stop sooner, keeping every fact, and that one was split at its colon. Every clause now fits, the widest by 325px of 331.

**A space between English clauses, none after a Japanese mark.** A first version spaced them all, which put a gap in 証拠金維持率： 有効証拠金, and a test failed on it.

## 3 Consequences

- A tip never breaks inside a clause, on a desktop or a phone, in any of the three languages.
- A definition may be several lines, each ending at a mark, and is longer than a tip by design; the hover tips, which are one line, are unchanged.
- The margin on a phone is thin, 6px for the widest clause, so a font that renders wider on a real device could still overflow it. A check holds the text to 58 English and 24 Japanese and Chinese characters a clause as an early warning; the browser measurement above is the proof, and it was made in one browser.
- A new module, `public/clauses.js`, holds the splitter, with no page code in it, so the page and the checks share it. `public/tips.js` takes it through `useClauses`, as it takes its words, so it still imports nothing.
- `test/info.test.ts` checks the splitting, numbers and abbreviations, and the joins; `test/tips.test.ts` that every clause is short enough, that splitting loses no words and breaks only after a mark, and that a clause cannot wrap.
- The check of the joins failed first on the stray space, and again when the fix was taken out.
- Colons count as a break, so a line may end after Stop Loss: and the explanation begin on the next; a label and its definition are not kept together.
