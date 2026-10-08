import { expect, it } from "vitest";
import { live, magnets, move, page, visitor } from "./helpers.ts";
import { next } from "./sse.ts";

// The brief's real-time requirement, against the running app: a move one
// visitor makes reaches another visitor's open page within about a second,
// with no reload. Pages listen on /api/events (server-sent events).

// Read-only, so it runs against the live door too: the stream is open.
it("streams events to an open page", async () => {
  const p = await page();
  try {
    expect(p.res.status).toBe(200);
    expect(p.res.headers.get("content-type")).toMatch(/^text\/event-stream/);
  } finally {
    p.close();
  }
});

it.skipIf(live)("sends a move to another open page within a second", async () => {
  const mover = await visitor();
  const watcher = await page(await visitor());
  const before = (await magnets())[5];
  const target = { x: 0.2468, y: 0.1357 };
  try {
    const heard = next(watcher.body, (e) => e.id === before.id && e.x === target.x, 1000);
    const started = Date.now();
    expect((await move(before.id, target, mover)).status).toBe(200);
    // the watcher sees it moved, and sees that it isn't theirs
    expect(await heard).toMatchObject({ id: before.id, ...target, mine: false });
    expect(Date.now() - started).toBeLessThan(1000);
  } finally {
    watcher.close();
  }
});
