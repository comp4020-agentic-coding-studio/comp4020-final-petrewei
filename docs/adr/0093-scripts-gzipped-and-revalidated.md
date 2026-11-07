# ADR 0093: Scripts Gzipped and Revalidated

Status: accepted, 8 November 2026. Peter asked for the efficiency work the simplify review found.

## 1 Context

Every visit downloaded the page's scripts, stylesheet and icon whole and uncompressed, about 460 KB, marked never to be kept, so a reload fetched them all again.

## 2 Decision

**A script is sent gzipped, with a tag of its content.** The server gzips each script, the stylesheet and the icon once, the first time it is asked, and sends that to a browser that accepts gzip. Each carries a tag from a hash of its content and is marked to be checked before use, so a reload that already has a file is told it is unchanged in an empty reply; a deploy changes the tag, so nobody runs old code.

**A page is written fresh every time.** The pages carry the server's words and, for the operator, the debug console, so they stay unkept and untagged.

**The scripts are one list.** The server serves each name in one list from `public/`, rather than an entry per file, and a check follows every module the pages import, so a module left off the list fails it.

## 3 Consequences

The seven largest files fell from 368 KB to 120 KB over the wire, and an unchanged file costs a reload nothing but its tag.
