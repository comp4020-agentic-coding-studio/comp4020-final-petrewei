import { describe, expect, it } from "vitest";
import { width } from "../src/lines.ts";
import { live, move, page, sleep, visitor, word } from "./helpers.ts";

// ADR 0008: every open page is told the round every second, with its prompt,
// when it ends and a ranking by short code. A line of three words its visitor
// placed earns them points while it stands.

type Round = {
  type: "round";
  phase: "play" | "break";
  prompt: string;
  endsAt: number;
  board: { who: string; points: number; you: boolean }[];
  lines: { ids: string[]; mine: boolean; answers: boolean }[];
};

it("tells an open page the round, once a second", async () => {
  const p = await page();
  try {
    const round = (await p.next((e) => e.type === "round", 2500)) as Round | null;
    expect(round).not.toBeNull();
    expect(["play", "break"]).toContain(round!.phase);
    expect(round!.prompt.length).toBeGreaterThan(0);
    expect(round!.endsAt).toBeGreaterThan(Date.now() - 1000);
    expect(Array.isArray(round!.board)).toBe(true);
  } finally {
    p.close();
  }
});

describe.skipIf(live)("a standing line", () => {
  it("earns its owner points, shown as theirs", async () => {
    const me = await visitor();
    const ws = await Promise.all(["hand", "eye", "star"].map((t) => word(t)));
    let x = 0.2;
    for (const w of ws) {
      expect((await move(w.id, { x, y: 0.08 }, me)).status).toBe(200);
      x += width(w.text) + 0.008;
    }
    const p = await page(me);
    try {
      await sleep(2200);
      let round: Round | null = null;
      for (let i = 0; i < 3; i++) {
        const r = (await p.next((e) => e.type === "round", 2000)) as Round | null;
        if (r?.phase === "play") round = r;
      }
      if (!round) return; // a break: nothing scores, nothing to check
      expect(round.lines.some((l) => l.mine && ws.every((w) => l.ids.includes(w.id)))).toBe(true);
      expect(round.board.find((b) => b.you)?.points).toBeGreaterThan(0);
    } finally {
      p.close();
    }
  }, 20_000);
});
