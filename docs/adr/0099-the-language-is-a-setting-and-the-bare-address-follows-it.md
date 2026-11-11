# ADR 0099: The Language Is a Setting, and the Bare Address Follows It

Status: accepted, 12 November 2026. Changes how [ADR 0016](0016-the-address-names-the-language.md) picks the language for the bare address; the rest of it stands. Peter asked for it.

## 1 Context

The language was chosen by the address (`/` English, `/ja/` Japanese, `/zh/` Chinese) and by a menu in the header that loaded another address. Peter wanted the choice in Settings, set to the browser's or system's language to begin with, and English for any language the game does not have.

## 2 Options

- **One address for all three, the choice only in the browser.** Every language at `/`. It would break every shared `/ja/` and `/zh/` link, the translated READMEs, the wiki, the QR codes already handed out, and the checks that each language has its own address.
- **Settings only moves the page to `/ja/` or `/zh/`.** Smallest change, but a plain `/` would still be English whatever the browser says.
- **Settings keeps the choice and the bare address follows it; the language addresses stay.** A link still means what it says, and `/` adapts.

## 3 Decision

**The third.** `/ja/` and `/zh/` always show their language, so a shared link, a QR code, the README and the wiki read as before. The bare `/` shows, in this order, the language chosen in Settings, else the browser's (its `Accept-Language`), else English; any other browser language falls to English.

The choice is kept in a cookie, `lang`, as well as the browser's storage, so the server can send `/` in the right language at once and the page never loads in English and then jumps, the flash ADR 0016 was written to avoid. The cookie holds one of the three language codes and nothing else, is read only to choose a page, and is `Secure` in production like the visitor's. The server reads it and the `Accept-Language` header, never anything the page sends in a request body.

Choosing a language in Settings saves the cookie and loads that language's address, as the header's menu did; the menu leaves the header. The name dialog's menu is the first screen a newcomer sees, so it stays there, and it too saves the choice.

## 4 Consequences

Rooms are by market only, so the language still never reaches the server's rooms, orders or feed. A person who has never chosen sees their own language on the first visit without choosing it. A visitor with the cookie cleared falls back to the browser's language, then English. `/ja/` and `/zh/` ignore the cookie, so a link cannot be turned into another language by one. The server reads one more cookie, which names a language and no person.
