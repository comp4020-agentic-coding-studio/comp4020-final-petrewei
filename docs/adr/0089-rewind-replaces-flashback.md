# ADR 0089: Rewind Replaces Flashback

Status: accepted, 7 November 2026. Renames one tab of [ADR 0088](0088-flashback-sandbox-and-live.md). Peter chose the name.

## 1 Context

Flashback was the longest tab label, and its Japanese, フラッシュバック, eight full-width characters, the longest in any language, crowding a phone's tab bar.

## 2 Decision

**The real-days tab is Rewind**: you go back to a real day the market broke, without knowing which. In Japanese it is 巻き戻し and in Chinese 倒带, rewinding a tape, as the icon shows; not 回想 or 闪回, the screen-memory words that matched Flashback. Chinese was first 回溯, which Peter found too abstract. Its icon is the rewind mark, ⏪. The mode keeps its id, `replay`.

**Addresses.** `#rewind` opens the tab, and `#flashback` still does, so a link from the day it had that name keeps working.

## 3 Consequences

The widest tab bar is now English, 429px on a desktop; Japanese fell to 410px.
