import { expect, it } from "vitest";
import { MAX_SESSIONS, Mcp, TOOLS } from "../src/mcp.ts";

// An AI agent plays Live through MCP: a session is one new player, every tool goes through the page's own action, and
// the limits hold. Fake dependencies stand for Live, so the protocol is checked alone.
function setup() {
  const acted: { who: string; input: Record<string, unknown> }[] = [];
  let now = 1_000_000;
  const mcp = new Mcp({
    join: (who) => `Agent ${who.slice(0, 6)}`,
    view: () => ({ pair: "AUD/USD", prices: [0.7, 0.701], live: true, you: { equity: 10_000, balance: 10_000, positions: [] } }),
    act: (who, input) => (acted.push({ who, input }), input.leverage === 7 ? "No such leverage." : null),
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
