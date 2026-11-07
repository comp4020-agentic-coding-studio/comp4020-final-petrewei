// ADR 0052, 0080: the tutorial's credit lesson asks the player to press Borrow, so the server must say it lends while
// that lesson waits, though no round trades in the tutorial; and once the tutorial is finished, it lends no more.
import { afterEach, expect, it } from "vitest";
import { client } from "../spec/helpers.ts";
import { type Server, server } from "./server.ts";

let s: Server | null = null;
afterEach(async () => { await s?.stop(); s = null; });

type Seen = { phase: string; lesson: { id: string; finished: boolean }; you: { lending?: boolean } };

it("lends in the tutorial's credit lesson while it waits for the player, and not once it is finished", async () => {
  s = await server(8197, { TICK_MS: "10" });
  const c = client(s.base);
  const me = await c.visitor();
  const look = async () => (await c.state(me, "tutorial")) as unknown as Seen;
  const go = (kind: string) => c.act(me, { mode: "tutorial", kind });
  const settle = async () => { for (let i = 0; i < 200 && (await look()).phase !== "waiting"; i++) await new Promise((r) => setTimeout(r, 20)); };
  await go("play");
  for (let i = 0; i < 30 && (await look()).lesson.id !== "credit"; i++) { await settle(); await go("skip"); }
  await settle();
  const credit = await look();
  expect(credit.lesson.id).toBe("credit");
  expect(credit.you.lending, "the credit lesson can be answered with Borrow").toBe(true);
  for (let i = 0; i < 30 && !(await look()).lesson.finished; i++) { await settle(); await go("skip"); }
  await settle();
  const done = await look();
  expect(done.lesson.finished).toBe(true);
  expect(done.you.lending, "a finished tutorial lends no more").toBe(false);
}, 30_000);
