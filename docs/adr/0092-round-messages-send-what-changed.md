# ADR 0092: Round Messages Send What Changed

Status: accepted, 8 November 2026. Refines the price deltas of [ADR 0062](0062-thirty-day-rounds-and-a-chart-that-opens-full.md). Peter asked for the efficiency work the simplify review found.

## 1 Context

A round sends every page a message twice a second, about 4.8 KB each while trading. Some of it never changes in a round: the broker's numbers, the ladder of leverages, the round count a hall ranks after, the list of pairs or plots. The feed changes only when something is said.

## 2 Decision

**A delta leaves out what the page has.** A message whose `from` is above 0 omits the fixed fields, and the feed unless it moved since that page last had it. A round keeps a feed version, moved by anything said and by a private notice, and each page's stream remembers the version it was sent. A whole state, `from` 0, carries everything.

**The page fills in what was left out.** The page's transport keeps the last value of each omitted field and adds it to a delta before the page renders, so the page always renders a whole state and needs no change. Switching tabs clears what it kept. The protocol types the message as sent apart from the state rendered.

## 3 Consequences

A trading delta fell from about 4.8 KB to 2.9 KB at the median, with the feed sent only when it changes. The traders' standings, the largest part left, change with the price and are still sent each time.
