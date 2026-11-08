import { expect, it } from "vitest";
import { baseUrl } from "./helpers.ts";

// ADR 0096: an AI agent plays Live through MCP at /mcp, with any MCP client and no key, as the README promises. Opening
// a session and listing the tools changes nothing (an account is made only by a first trade), so this runs against the
// live app too; the tools' rules are checked in test/mcp.test.ts.
it("answers any MCP client at /mcp: a session, and Live's trading tools", async () => {
  const url = new URL("/mcp", baseUrl);
  const post = (body: unknown, session?: string) =>
    fetch(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(session ? { "mcp-session-id": session } : {}) }, body: JSON.stringify(body) });
  const init = await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "spec", version: "1" } } });
  expect(init.status).toBe(200);
  const session = init.headers.get("mcp-session-id");
  expect(session).toMatch(/^[0-9a-f-]{36}$/);
  const hello = (await init.json()) as { result: { capabilities: { tools?: unknown }; serverInfo: { name: string } } };
  expect(hello.result.capabilities.tools).toBeDefined();
  const list = (await (await post({ jsonrpc: "2.0", id: 2, method: "tools/list" }, session!)).json()) as { result: { tools: { name: string }[] } };
  expect(list.result.tools.map((t) => t.name)).toEqual(expect.arrayContaining(["market", "history", "buy", "sell", "close", "pending", "cancel_pending"]));
  // a call without a session is refused, never answered as someone else
  const stray = (await (await post({ jsonrpc: "2.0", id: 3, method: "tools/list" })).json()) as { error?: { code: number } };
  expect(stray.error?.code).toBe(-32001);
  await fetch(url, { method: "DELETE", headers: { "mcp-session-id": session! } });
});
