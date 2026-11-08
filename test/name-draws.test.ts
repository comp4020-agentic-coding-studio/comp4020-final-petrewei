import { afterEach, expect, it } from "vitest";
import { client } from "../spec/helpers.ts";
import { GIVEN } from "../public/names.js";
import { type Server, server } from "./server.ts";

// A drawn name is never one somebody holds: a suggestion picks from the names still free, however few are left, and
// a newcomer is dealt a free one, so pressing Begin on the name their box opens with never meets "Someone already has
// that name". A server of its own, since it fills the names.
let s: Server;
afterEach(() => s.stop());

it("suggests and deals only names nobody holds, even with nearly all taken", async () => {
  s = await server(8091);
  const { visitor } = client(s.base);
  const name = async (cookie: string, body?: unknown) =>
    (await fetch(`${s.base}/api/name`, body === undefined ? { headers: { cookie } } : { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) })).json() as Promise<{ name: string; draw: number; error?: string }>;
  // every drawn name but three is chosen by somebody
  const keep = new Set([3, 77, GIVEN.length - 1]);
  for (let g = 0; g < GIVEN.length; g++) {
    if (keep.has(g)) continue;
    const held = await name(await visitor(), { name: GIVEN[g].en });
    expect(held.error, GIVEN[g].en).toBeUndefined();
  }
  const me = await visitor();
  const seen = new Set<number>();
  for (let i = 0; i < 30; i++) seen.add((await name(me)).draw);
  expect([...seen].every((d) => keep.has(d)), `suggested ${[...seen]}`).toBe(true);
  // a newcomer's own name, which their box opens with, is one of the free ones too, so Begin keeps it
  const newcomer = await visitor();
  const dealt = ((await (await fetch(`${s.base}/api/state`, { headers: { cookie: newcomer } })).json()) as { you: { draw: number | null } }).you.draw;
  expect(keep.has(dealt!), `dealt ${dealt}`).toBe(true);
  const begun = await name(newcomer, { name: GIVEN[dealt!].en });
  expect(begun.error).toBeUndefined();
}, 60_000);
