# ADR 0098: Live's News from Investing.com, and No Release Calendar

Status: accepted, 10 November 2026. Changes the news half of [ADR 0087](0087-marathon-on-real-prices-and-accounts-in-australian-dollars.md): its market headlines and its week's calendar of releases. Peter asked for both.

## 1 Context

Live's feed told headlines from CNBC, with BBC News, ABC News and FXStreet behind it. They were general business news, so a quiet weekend left the feed with one story or none, and a story three days old sat in it. Live also fetched the ForexFactory calendar of releases every hour, which it stopped showing earlier in the week, and the footer still credited it.

## 2 Options

- **Keep the four outlets.** Nothing to build, but the feed stays thin on currencies and old on a weekend.
- **Google News.** Plenty of items, but its links are redirects through `news.google.com`, which the rule that a headline links only to its outlet's own site would have to be loosened for, and it mixes in sources that have nothing to do with markets.
- **Investing.com's forex feed.** Nearly every item is about currencies, and it publishes at weekends. It lists only ten items.

## 3 Decision

**Investing.com's forex feed leads, and the four outlets stay behind it.** The first feed that answers is read, so a feed that blocks the server leaves Live with headlines. Only a link on investing.com is accepted. It answers from Fly's network, as the deployed feed showed. Peter read the site's terms and decided that using its RSS feed is allowed; this record rests on that and not on a check of its own, since the terms page could not be read by a script.

**Live fetches no release calendar,** and the page keeps no list or words for one. The footer credits Investing.com, the other outlets and the central banks, and no calendar.

Stories are told only if they are under a day old, and the feed lists the newest first. Where a central bank's statement and a story are told together they are ordered by when each was published.

## 4 Consequences

The feed is current and about currencies. A quiet weekend can leave it short, which matters little as Live is shut then. Investing.com lists ten items, so it reaches back about two days. Whether a game may show its headlines is Peter's reading of its terms, which is not legal advice. Random's own calendar is unchanged.
