import { afterEach, describe, expect, it } from "vitest";
import { live, move, page, post, sleep, visitor, word } from "./helpers.ts";
import { next } from "./sse.ts";

// ADR 0002, one hand at a time: while one visitor holds a word, nobody else
// can grab or move it, and every open page is told it is held. Letting go,
// moving it, or closing the holder's last open page frees it.

// One word for this file, so a hold here can't collide with a move elsewhere.
const TEXT = "whisper";
let holder = "";
afterEach(async () => {
  if (holder) await post(`/api/magnets/${(await word(TEXT)).id}/release`, holder);
  holder = "";
});

describe.skipIf(live)("one hand at a time", () => {
  it("refuses a second grab and a move by anyone but the holder", async () => {
    const a = (holder = await visitor());
    const b = await visitor();
    const m = await word(TEXT);

    expect((await post(`/api/magnets/${m.id}/grab`, a)).status).toBe(200);
    // grabbing again is fine for the holder: a long drag renews its hold
    expect((await post(`/api/magnets/${m.id}/grab`, a)).status).toBe(200);
    expect((await post(`/api/magnets/${m.id}/grab`, b)).status).toBe(409);
    expect((await move(m.id, { x: 0.5, y: 0.5 }, b)).status).toBe(409);

    // another visitor sees it held; the holder doesn't see it as held against them
    expect((await word(TEXT, b)).held).toBe(true);
    expect((await word(TEXT, a)).held).toBe(false);
    expect((await word(TEXT)).x).toBe(m.x);
  });

  it("frees the word when the holder moves it, and when they let go", async () => {
    const a = (holder = await visitor());
    const b = await visitor();
    const m = await word(TEXT);

    await post(`/api/magnets/${m.id}/grab`, a);
    expect((await move(m.id, { x: m.x, y: m.y }, a)).status).toBe(200);
    expect((await post(`/api/magnets/${m.id}/grab`, b)).status).toBe(200);
    expect((await post(`/api/magnets/${m.id}/release`, b)).status).toBe(200);
    expect((await word(TEXT, a)).held).toBe(false);
  });

  it("frees the word when the holder's last open page closes", async () => {
    const a = (holder = await visitor());
    const b = await visitor();
    const m = await word(TEXT);

    const p = await page(a);
    expect(p.res.status).toBe(200);
    expect((await post(`/api/magnets/${m.id}/grab`, a)).status).toBe(200);
    expect((await post(`/api/magnets/${m.id}/grab`, b)).status).toBe(409);

    p.close();
    let status = 0;
    for (let i = 0; i < 20 && status !== 200; i++) {
      await sleep(100);
      status = (await post(`/api/magnets/${m.id}/grab`, b)).status;
    }
    expect(status).toBe(200);
    holder = b;
  });

  it("tells other open pages when a word is taken and when it is free", async () => {
    const a = (holder = await visitor());
    const m = await word(TEXT);
    const p = await page(await visitor());
    try {
      const held = next(p.body, (e) => e.type === "held" && e.id === m.id, 1000);
      await post(`/api/magnets/${m.id}/grab`, a);
      expect(await held).not.toBeNull();
      const freed = next(p.body, (e) => e.type === "released" && e.id === m.id, 1000);
      await post(`/api/magnets/${m.id}/release`, a);
      expect(await freed).not.toBeNull();
    } finally {
      p.close();
    }
  });
});
