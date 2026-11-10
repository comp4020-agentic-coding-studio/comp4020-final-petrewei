import { expect, it } from "vitest";
import { MAX_SESSIONS, Mcp, SIGNUPS_PER_HOUR, TOOLS } from "../src/mcp.ts";

// An AI agent plays Live through MCP: a session is one new player, every tool goes through the page's own action, and
// the limits hold. Fake dependencies stand for Live, so the protocol is checked alone.
function setup() {
  const acted: { who: string; input: Record<string, unknown> }[] = [];
  let now = 1_000_000;
  const mcp = new Mcp({
    join: (who) => `Agent ${who.slice(0, 6)}`,
    view: () => ({ pair: "AUD/USD", prices: [0.7, 0.701], live: true, you: { equity: 10_000, balance: 10_000, positions: [] } }),
    act: (who, input) => {
      acted.push({ who, input });
      if (input.kind === "pair") return "Account closed.";
      return input.leverage === 7 ? "No such leverage." : null;
    },
    isPair: (p) => typeof p === "string" && /^[A-Z]{3}\/[A-Z]{3}$/.test(p),
    now: () => now,
  });
  const rpc = (sid: string | undefined, method: string, params?: unknown, id: number | null = 1) =>
    mcp.handle("POST", sid, { jsonrpc: "2.0", ...(id === null ? {} : { id }), method, ...(params ? { params } : {}) });
  return { mcp, rpc, acted, tick: (ms: number) => (now += ms) };
}

it("opens a session as one new player, lists the tools, and trades through the page's own action", () => {
  const { rpc, acted, tick } = setup();
  const init = rpc(undefined, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
  const sid = init.headers["mcp-session-id"];
  expect(sid).toMatch(/^[0-9a-f-]{36}$/);
  expect((init.body as { result: { capabilities: unknown; instructions: string } }).result.instructions).toMatch(/Agent/);
  expect(rpc(sid, "notifications/initialized", undefined, null).status).toBe(202);
  expect((rpc(sid, "tools/list").body as { result: { tools: unknown[] } }).result.tools).toHaveLength(TOOLS.length);
  const bought = rpc(sid, "tools/call", { name: "buy", arguments: { pair: "AUD/USD", leverage: 10, margin: 0.25, stop_loss: 5 } });
  expect((bought.body as { result: { isError?: boolean } }).result.isError).toBeUndefined();
  expect(acted.at(-1)!.input).toEqual({ mode: "live", kind: "buy", pair: "AUD/USD", leverage: 10, share: 0.25, sl: 5, tp: null });
  // a refusal from Live's rules comes back as the tool's error, its words unchanged
  tick(1_500);
  const refused = rpc(sid, "tools/call", { name: "sell", arguments: { pair: "AUD/USD", leverage: 7, margin: 0.25 } });
  expect((refused.body as { result: { isError: boolean; content: { text: string }[] } }).result).toMatchObject({ isError: true, content: [{ text: "No such leverage." }] });
});

it("refuses a tool call without a session, a bad pair, and more than one action a second", () => {
  const { rpc, tick } = setup();
  expect((rpc(undefined, "tools/list").body as { error: { code: number } }).error.code).toBe(-32001);
  const sid = rpc(undefined, "initialize", {}).headers["mcp-session-id"];
  expect((rpc(sid, "tools/call", { name: "close", arguments: { pair: "nope" } }).body as { result: { isError: boolean } }).result.isError).toBe(true);
  rpc(sid, "tools/call", { name: "close", arguments: { pair: "AUD/USD" } });
  const fast = rpc(sid, "tools/call", { name: "close", arguments: { pair: "AUD/USD" } });
  expect((fast.body as { result: { content: { text: string }[] } }).result.content[0].text).toMatch(/One action a second/);
  tick(1_100);
  expect((rpc(sid, "tools/call", { name: "close", arguments: { pair: "AUD/USD" } }).body as { result: { isError?: boolean } }).result.isError).toBeUndefined();
});

it("holds at most twenty agents, and frees a session left idle half an hour", () => {
  const { mcp, rpc, tick } = setup();
  for (let i = 0; i < MAX_SESSIONS; i++) rpc(undefined, "initialize", {});
  expect((rpc(undefined, "initialize", {}).body as { error: { message: string } }).error.message).toMatch(/Too many agents/);
  expect(mcp.active()).toBe(MAX_SESSIONS);
  tick(31 * 60_000);
  expect(mcp.active()).toBe(0);
  expect(rpc(undefined, "initialize", {}).headers["mcp-session-id"]).toBeDefined();
});

it("tells a shut weekend market's opening, lists common pairs, and gives a pair's history", () => {
  const opens = Date.parse("2026-11-08T22:00:00Z");
  const closes = Array.from({ length: 200 }, (_, i) => 0.7 + i / 10_000);
  const mcp = new Mcp({
    join: (who) => `Agent ${who.slice(0, 6)}`,
    view: () => ({ pair: "AUD/USD", prices: closes, live: false, opens, you: { equity: 10_000, balance: 10_000, positions: [] } }),
    act: () => null,
    isPair: (p) => typeof p === "string" && /^[A-Z]{3}\/[A-Z]{3}$/.test(p),
    now: () => 1,
  });
  const sid = mcp.handle("POST", undefined, { jsonrpc: "2.0", id: 1, method: "initialize", params: {} }).headers["mcp-session-id"];
  const call = (name: string, args: Record<string, unknown>) =>
    (mcp.handle("POST", sid, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } }).body as { result: { content: { text: string }[]; isError?: boolean } }).result;
  const market = call("market", {}).content[0].text;
  expect(market).toMatch(/shut for the weekend: it opens 2026-11-08 ?T?22:00 UTC/);
  expect(market).toMatch(/Common pairs: AUD\/USD/);
  const history = call("history", { pair: "AUD/USD", count: 10 });
  expect(history.isError).toBeUndefined();
  expect(history.content[0].text).toMatch(/10 closes/);
  expect(history.content[0].text).toMatch(/high 0\.71990, low 0\.71900/);
  expect(call("history", { pair: "nope" }).isError).toBe(true);
  // a pair is needed to read a history; leaving it out is refused, not read as the account's own pair
  expect(call("history", {}).isError).toBe(true);
});

it("expires an idle session when its next request arrives", () => {
  const { rpc, tick } = setup();
  const sid = rpc(undefined, "initialize").headers["mcp-session-id"];
  tick(31 * 60_000);
  expect(rpc(sid, "tools/list").body).toMatchObject({ error: { code: -32001 } });
});

it("returns the refusal when Live cannot select the requested pair", () => {
  const { rpc } = setup();
  const sid = rpc(undefined, "initialize").headers["mcp-session-id"];
  for (const name of ["market", "history"]) {
    const reply = rpc(sid, "tools/call", { name, arguments: { pair: "EUR/USD" } });
    expect(reply.body).toMatchObject({
      result: { isError: true, content: [{ text: "Account closed." }] },
    });
  }
});

it("requires an explicit pending order side", () => {
  const { rpc, acted } = setup();
  const sid = rpc(undefined, "initialize").headers["mcp-session-id"];
  const reply = rpc(sid, "tools/call", { name: "pending", arguments: { pair: "AUD/USD", at: 0.65, leverage: 10, margin: 0.25 } });
  expect(reply.body).toMatchObject({ result: { isError: true } });
  expect(acted).toEqual([]);
});

// Each session is a player whose name is kept for good, so a script that opens and closes sessions in a loop would fill
// the names file and leave no name for a real player. The twenty at once do not stop that, as an ended session frees
// its place. Sign-ups are limited in an hour across all agents, since the server knows no client address to limit by.
it("limits how many sessions may open in an hour, even when each one ends at once", () => {
  const { mcp, rpc, tick } = setup();
  const open = () => rpc(undefined, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } });
  for (let i = 0; i < SIGNUPS_PER_HOUR; i++) {
    const r = open();
    expect(r.body, `sign-up ${i + 1} of ${SIGNUPS_PER_HOUR}`).toMatchObject({ result: expect.anything() });
    // the agent leaves at once: its place is free, which is why the twenty at once cannot be the limit
    mcp.handle("DELETE", r.headers["mcp-session-id"], null);
  }
  expect(mcp.active(), "no session is left open").toBe(0);
  expect(open().body, "one past the limit is refused").toMatchObject({ error: { code: -32000, message: expect.stringMatching(/hour/i) } });
  tick(61 * 60_000);
  expect(open().body, "an hour on, sign-ups are open again").toMatchObject({ result: expect.anything() });
});
