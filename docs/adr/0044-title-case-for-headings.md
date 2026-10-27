# ADR 0044: Title Case for Headings

Status: accepted, 28 October 2026. Applies to the English headings and titles of the pages built in [ADR 0039](0039-a-tidier-page.md) and earlier.

## 1 Context

Peter asked for Capital Case for titles and headings. The page had them in sentence case, Your position and Hall of fame, beside the Stop Loss and Take Profit that [ADR 0035](0035-drag-exits-on-the-chart.md) had already capitalised.

## 2 Decision

English titles and headings are in Title Case: every word starts with a capital except the short ones, a, an, and, as, at, but, by, for, from, if, in, nor, of, off, on, or, per, so, the, to, up, via, vs, with, into, onto and than, which stay lower-case unless first. Verbs such as is stay capitalised, so Replay Is Waiting. The rule covers the panel headings, the name box's titles, the lobby's titles, the tutorial's twelve lesson titles, the table column headers, the labels Net Worth, Margin Level and Name That Year, the About page's headings, and the operator's log and debug headings.

Buttons, notes and sentences are not headings and stay as they were: Leave round, Start again, and the note all-time, by average score. Japanese and Chinese have no case and are unchanged.

## 3 Consequences

- A heading in the market, the tutorial, the lobby and the About page reads the same way.
- A short preposition at the end of a title, the from in Where the Prices Come from, stays lower-case.
- `test/tips.test.ts` holds a list of the headings, every lesson title and every About heading to the rule, and checks that the page's own markup shows the same text as its translations, so a later heading in sentence case fails.
- A browser check read the headings on the market, in the tutorial, in the lobby and on the About page.
