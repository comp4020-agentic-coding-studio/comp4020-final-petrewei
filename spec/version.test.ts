import { describe, expect, it } from "vitest";
import { live, magnets, move, post, visitor, word } from "./helpers.ts";

// Every change to a word raises its version, so a page can tell newer news
// from older (CLAUDE.md, App and Data). A refusal carries the word as the
// server has it, so the refused page can correct itself without asking again.

const TEXT = "kettle";

describe.skipIf(live)("versions", () => {
  it("rise with every move, hold and release, and come back in the replies", async () => {
    const me = await visitor();
    const m = await word(TEXT);
    const grabbed = (await (await post(`/api/magnets/${m.id}/grab`, me)).json()) as { held: boolean; v: number };
    expect(grabbed.v).toBeGreaterThan(m.v);
    const moved = (await (await move(m.id, { x: 0.2, y: 0.2 }, me)).json()) as { magnet: { v: number } };
    expect(moved.magnet.v).toBeGreaterThan(grabbed.v);
    await post(`/api/magnets/${m.id}/grab`, me);
    const freed = (await (await post(`/api/magnets/${m.id}/release`, me)).json()) as { held: boolean; v: number };
    expect(freed.v).toBeGreaterThan(moved.magnet.v);
    expect((await word(TEXT)).v).toBe(freed.v);
  });

  it("send the word as it stands with a refusal", async () => {
    const a = await visitor();
    const b = await visitor();
    const m = await word(TEXT);
    await post(`/api/magnets/${m.id}/grab`, a);
    try {
      const res = await move(m.id, { x: 0.6, y: 0.6 }, b);
      expect(res.status).toBe(409);
      const { magnet } = (await res.json()) as { magnet: { id: string; x: number; y: number; held: boolean; v: number } };
      const now = (await magnets(b)).find((w) => w.id === m.id)!;
      expect(magnet).toMatchObject({ id: m.id, x: now.x, y: now.y, held: true, v: now.v });
    } finally {
      await post(`/api/magnets/${m.id}/release`, a);
    }
  });
});
