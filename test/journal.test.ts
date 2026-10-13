import { afterEach, expect, it } from "vitest";
import { type Server, server } from "./server.ts";

// ADR 0006: a move confirmed to its visitor survives SIGKILL, the one exit
// the server can't flush on. Kills a server of the test's own straight after
// a move and starts it again on the same data directory.
let s: Server;
afterEach(() => s.stop());

it("keeps a confirmed move after the server is killed outright", async () => {
  s = await server(8099);
  const res = await fetch(`${s.base}/api/magnets/m7`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ x: 0.4242, y: 0.2121 }),
  });
  expect(res.status).toBe(200);
  s.proc.kill("SIGKILL");
  await new Promise((r) => s.proc.once("exit", r));

  await s.restart();
  const { magnets } = (await (await fetch(`${s.base}/api/magnets`)).json()) as { magnets: { id: string; x: number; y: number }[] };
  expect(magnets.find((m) => m.id === "m7")).toMatchObject({ x: 0.4242, y: 0.2121 });
}, 20_000);
