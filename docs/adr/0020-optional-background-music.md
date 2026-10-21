# ADR 0020: Optional Background Music

Status: accepted, 21 October 2026.

## 1 Context

Peter asked for optional background music. His first track was the anime's own ending theme, a commercial KADOKAWA release; the agent flagged that publishing it would put copyrighted music in a public repository and on the live site, against the parody rule of [ADR 0009](0009-a-parody-fx-trading-floor.md) and [ADR 0015](0015-three-languages-and-the-comics-characters.md). Peter withdrew it, and it was deleted without ever being committed. He then supplied `bgm.m4a`, which he states has no copyright problem; the file carries no artist, title or licence tags, so that statement is the record of its source.

## 2 Decision

The music is off by default. A note button beside the theme switch turns it on; only then is `/audio/bgm.m4a` fetched, since the page's `<audio>` is `preload="none"`. The choice is remembered in the browser, but browsers let sound start only from a click, so a returning player who left it on hears it from their first click anywhere. It loops at a third of full volume.

Peter's file was Apple Lossless at about 1 Mbit/s and 27.7 MB, which Safari plays and Chrome and Firefox do not; the agent converted it with ffmpeg to AAC-LC at 160 kbit/s, 4.5 MB, with its index at the front so playback starts before the whole file arrives, and kept the lossless original outside the repository. The server serves the one fixed file as exact bytes, with HTTP ranges, so a browser can stream and seek; no path a request names reaches the disk.

## 3 Consequences

- Silence is the default, and the 4.5 MB track costs nothing until a player asks for it.
- The track's licence rests on Peter's statement. If its source turns out otherwise, replacing `public/audio/bgm.m4a` replaces it everywhere.
- A fourth tool in the top bar left ロスカット！ only just clear of it at 360px; the tools are tightened on phones.
- `spec/music.test.ts` checks the bytes, the ranges, that nothing else in the folder is served, and that the switch starts off with no autoplay.
