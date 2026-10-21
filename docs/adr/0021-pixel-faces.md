# ADR 0021: Pixel Faces

Status: accepted, 21 October 2026. Adds faces to the names of [ADR 0017](0017-chosen-trader-names.md) and [ADR 0018](0018-anime-names-and-seven-characters.md), under the parody rule of [ADR 0015](0015-three-languages-and-the-comics-characters.md).

## 1 Context

A room was a list of names. Peter asked for pixel-art icons for the house traders, after the official character designs and faces, such as Kurumi's, and some random default icons for players. He pointed to the anime site's character pages and gave colour pages from the manga for the three characters the anime has not drawn, Inago, Nana and Kizuna. `CLAUDE.md` forbids official art in the app, and the repository is public.

## 2 Options

- **Shrink the official images:** the closest likeness, but it puts KADOKAWA's art in a public repository and on the live site.
- **Trace them into pixels:** a traced image is still a copy of the art.
- **Draw new faces by hand,** at 16 by 16, from what a fan would name: hair colour and cut, eye colour, one accessory.

## 3 Decision

The agent chose the third. Each face is sixteen rows of letters in `public/avatars.js`, one letter a colour, written by hand from notes the agent took looking at the references: Kurumi's pink bob and hair clip, Mochiko's purple hair and black choker, Yasuko's black twin tails with white rabbit clips and red crossed pins, Mebuki's messy blonde hair, Inago's long blue-black hair, Nana's brown bob with a red streak and round glasses, and Kizuna's blonde bun. No pixel was sampled from an image. A page draws a face as an SVG of square pixels, so it is sharp at any size and costs no image request.

People are dealt one of twelve plain faces, five hairstyles in a range of colours, from a byte of their cookie's hash, as their drawn name is: the same face on every page, after a restart and in every language. A career is filed under that hash, so the hall of fame shows the same face as the room. The server sends only a face's name, `bot:kurumi` or `p7`; the page draws it from its own file, so nothing a person types reaches the SVG. Faces appear in the room, beside "You are", at the bell and in the hall.

Peter then asked to redraw his face as he redraws his name. The name dialog shows the face beside the name; a click draws another from the plain set, and Save sends it to `/api/face`. The server accepts only a plain face's name, never a house trader's, keeps it under the career key in `faces.json` on the volume, and logs the change. Unlike names, two people may share a face: the name beside it tells them apart, and twelve faces could not each be one person's.

The manga pages Peter gave are copyrighted scans, so they were moved to `reference/manga/`, which `.gitignore` keeps out of the repository, and their Windows download tags were deleted.

## 4 Consequences

- A room reads at a glance, and each house trader is recognisable without her name.
- A face is a cut and three colours, not a likeness; that is the price of drawing rather than copying.
- A face is dealt until its owner draws another; then it is kept, through restarts, in every room and the hall.
- `test/avatars.test.ts` checks every bot has its own well-formed face, the plain faces differ, a face is only pixels, the file holds no image, and the room, bell and hall agree, and a drawn face survives a hard kill; `spec/avatars.test.ts` checks the live server deals faces and refuses any face but a plain one.
