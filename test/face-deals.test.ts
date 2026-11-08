import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { client } from "../spec/helpers.ts";
import { PEOPLE } from "../public/avatars.js";
import { type Server, server } from "./server.ts";

// More plain faces must never redraw a face somebody already has. A face nobody chose is worked out from the cookie,
// so a player on record before the set grew keeps the face the first twelve gave them; a newcomer is dealt from every
// face, and their face is kept the moment they choose a name, so it never jumps when they become a player on record.
let s: Server;
afterEach(() => s.stop());
const OLD = 12;
const keyOf = (cookie: string) => createHash("sha256").update(cookie.replace(/^v=/, "")).digest("hex").slice(0, 16);

it("keeps an existing player's face, and fixes a newcomer's once they choose a name", async () => {
  expect(PEOPLE.length, "the set has grown past the first twelve").toBeGreaterThan(OLD);
  // a player on record from before the set grew: their name saved, their face never chosen nor stored
  // a key whose old face (from twelve) differs from the one all faces would give, so the check can only pass if the old
  // rule is kept, never by chance
  let old: string;
  let k: string;
  do {
    old = `v=${randomUUID()}`;
    k = keyOf(old);
  } while (Number.parseInt(k.slice(4, 6), 16) % OLD === Number.parseInt(k.slice(4, 8), 16) % PEOPLE.length);
  const dir = mkdtempSync(join(tmpdir(), "losscut-faces-"));
  writeFileSync(join(dir, "names.json"), JSON.stringify({ [k]: 5 }));
  s = await server(8092, {}, dir);
  const { visitor, state } = client(s.base);
  const before = `p${Number.parseInt(k.slice(4, 6), 16) % OLD}`;
  expect(((await state(old)).you as unknown as { face: string }).face, "the face the first twelve gave").toBe(before);
  // a newcomer's face, then the same face after they choose a name and so come on record
  const fresh = await visitor();
  const dealt = ((await state(fresh)).you as unknown as { face: string }).face;
  const named = await (await fetch(`${s.base}/api/name`, { headers: { cookie: fresh } })).json() as { name: string };
  expect((await fetch(`${s.base}/api/name`, { method: "POST", headers: { cookie: fresh, "content-type": "application/json" }, body: JSON.stringify({ name: named.name }) })).status).toBe(200);
  expect(((await state(fresh)).you as unknown as { face: string }).face, "unchanged once on record").toBe(dealt);
}, 30_000);
