# ADR 0048: Room for the Longest Tab

Status: accepted, 28 October 2026. Follows the rename of [ADR 0047](0047-simulation-replaces-scenario.md), which made the longest tab longer.

## 1 Context

Peter saw Simulation cut off with an ellipsis in the desktop view. The tab bar was a fixed 390px, a third of it, 125px, to each tab. ADR 0047 measured Simulation at phone width but not on a desktop, where the selected tab carries a player count: Simulation 1 needs 140px and Simulation 12 148px, so it showed Simulatio…. Scenario had fitted.

## 2 Decision

The tab bar is 460px, enough for the longest tab with a two-digit count in every state, in English, which sets the width; Japanese and Chinese are narrower. From 1181px the header holds it as its column, the brand column and the tools unmoved. Below that, from 901px down, side by side the tools would overlap it, and had already done so between 901 and 930px, before this change: so there the logo and the tools share the first row, the tabs take the second at 460px, set to the left, and who you are the third. Peter chose that over one tighter row, where Simulation might still be cut off.

A first try, the wider column everywhere, made 901 to 1000px overlap more, and a flexible column made no difference; a sweep found both before anything was shipped.

## 3 Consequences

- No tab is cut off on a desktop in any language, with or without a count, at any width from 561px to 1920px: 135 combinations were measured, three languages, fifteen widths and three tabs, each with a count of 12 on every tab.
- A window between 901px and 1180px has a header 146px tall, not 65px, with the tabs at the left and not centred, as on a phone.
- The overlap at 901 to 930px, which was there already, is gone.
- `test/tips.test.ts` checks the 460px column, the tab bar's own row in the narrow band, and that no font shrink was used to fit it.
