// An AI agent plays Live through MCP (the Model Context Protocol) at /mcp: JSON-RPC over HTTP, the protocol's own
// streamable-HTTP transport answered with plain JSON, which every MCP client speaks. No login: an agent's AI client
// pays for its own model, and this server asks nothing of it. Each MCP session is one new Live player, named "Agent"
// and a short code, trading through exactly the rules the page does (`act`), so an agent can bend nothing. Live only.
import { randomUUID } from "node:crypto";

export type McpDeps = {
  // a new player for a new session: its id, the same shape as a visitor's cookie, already named
  join: (who: string) => string;
  // Live's view for a player, and an action as the page would send it; an action answers null or a refusal
  view: (who: string) => Record<string, unknown>;
  act: (who: string, input: Record<string, unknown>) => string | null;
  isPair: (pair: unknown) => boolean;
  now: () => number;
};

const PROTOCOL = "2025-06-18";
// Limits, so an agent cannot flood the board: sessions at once, idle expiry, and the time between actions.
export const MAX_SESSIONS = 20;
// how many sessions may open in an hour, across all agents
export const SIGNUPS_PER_HOUR = 30;
const IDLE_MS = 30 * 60_000;
const ACT_MS = 1_000;

const side = { type: "string", enum: ["buy", "sell"] };
const pair = { type: "string", description: "A currency pair as BASE/QUOTE, such as AUD/USD or USD/JPY; any of 42." };
const order = {
  pair,
  leverage: { type: "number", enum: [1, 3, 10, 30, 100, 300, 1000], description: "The leverage. Australia caps retail traders at 30x; the rest is offshore." },
  margin: { type: "number", enum: [0.25, 0.5, 0.75, 1], description: "The share of the account's free margin to put in." },
  stop_loss: { type: "number", description: "Optional: a stop loss this many percent from the price, against you." },
  take_profit: { type: "number", description: "Optional: a take profit this many percent from the price, for you." },
};
export const TOOLS = [
  { name: "market", description: "Live's market for one pair: the price now and its recent closes, your account (in Australian dollars) and every position you hold, and whether the market is trading (and when it opens if not). With no pair, the pair you last looked at, and a list of common pairs.", inputSchema: { type: "object", properties: { pair }, additionalProperties: false } },
  { name: "history", description: "A pair's closes every 15 minutes, oldest first, for up to the last six days, with the day's high and low, to judge a trend.", inputSchema: { type: "object", properties: { pair, count: { type: "number", description: "How many closes, up to 576 (six days); 96 if not given (one day)." } }, required: ["pair"], additionalProperties: false } },
  { name: "buy", description: "Buy a pair at the live price: you profit if it rises. One position per pair; buying again adds to it.", inputSchema: { type: "object", properties: order, required: ["pair", "leverage", "margin"], additionalProperties: false } },
  { name: "sell", description: "Sell a pair at the live price: you profit if it falls. One position per pair; selling while long reduces or closes it.", inputSchema: { type: "object", properties: order, required: ["pair", "leverage", "margin"], additionalProperties: false } },
  { name: "close", description: "Close your position on a pair at the live price.", inputSchema: { type: "object", properties: { pair }, required: ["pair"], additionalProperties: false } },
  { name: "pending", description: "Wait to buy or sell a pair until the live price reaches a level, then fill at that price. One pending order per pair; a new one replaces it.", inputSchema: { type: "object", properties: { side, at: { type: "number", description: "The price to wait for." }, ...order }, required: ["side", "at", "pair", "leverage", "margin"], additionalProperties: false } },
  { name: "cancel_pending", description: "Cancel your pending order on a pair.", inputSchema: { type: "object", properties: { pair }, required: ["pair"], additionalProperties: false } },
];

type Session = { who: string; last: number; acted: number };
type Reply = { status: number; headers: Record<string, string>; body: unknown };

export class Mcp {
  private sessions = new Map<string, Session>();
  private d: McpDeps;
  constructor(d: McpDeps) {
    this.d = d;
  }

  // the players agents are now, so Live keeps polling prices while one trades with no page open
  active(): number {
    this.expire();
    return this.sessions.size;
  }

  // when each session in the last hour opened, to limit sign-ups
  private signups: number[] = [];

  private expire(): void {
    const now = this.d.now();
    for (const [id, s] of this.sessions) if (now - s.last > IDLE_MS) this.sessions.delete(id);
  }

  // One HTTP request: a JSON-RPC message (or a batch), and the session it belongs to by the Mcp-Session-Id header.
  handle(method: string, sessionId: string | undefined, message: unknown): Reply {
    if (method === "DELETE") {
      if (sessionId) this.sessions.delete(sessionId);
      return { status: 204, headers: {}, body: null };
    }
    // no server-to-client stream is offered: an agent asks, and is answered
    if (method !== "POST") return { status: 405, headers: { allow: "POST, DELETE" }, body: { error: "POST JSON-RPC to /mcp." } };
    this.expire();
    const batch = Array.isArray(message) ? message : [message];
    const out: unknown[] = [];
    let session = sessionId ? this.sessions.get(sessionId) : undefined;
    let newId: string | undefined;
    for (const m of batch) {
      if (!m || typeof m !== "object" || (m as { jsonrpc?: unknown }).jsonrpc !== "2.0") {
        out.push(error(null, -32600, "Invalid JSON-RPC request."));
        continue;
      }
      const { id, method: name, params } = m as { id?: string | number; method?: string; params?: Record<string, unknown> };
      // a notification (no id) is acknowledged with nothing
      if (id === undefined) continue;
      if (name === "initialize") {
        if (this.sessions.size >= MAX_SESSIONS) {
          out.push(error(id, -32000, "Too many agents are playing. Try again later."));
          continue;
        }
        // each session is a player whose name is kept for good, so sign-ups are limited in an hour, across all agents
        const hourAgo = this.d.now() - 3_600_000;
        this.signups = this.signups.filter((t) => t > hourAgo);
        if (this.signups.length >= SIGNUPS_PER_HOUR) {
          out.push(error(id, -32000, "Too many agents have joined this hour. Try again later."));
          continue;
        }
        this.signups.push(this.d.now());
        newId = randomUUID();
        const who = randomUUID();
        const display = this.d.join(who);
        session = { who, last: this.d.now(), acted: 0 };
        this.sessions.set(newId, session);
        out.push(result(id, {
          protocolVersion: typeof params?.protocolVersion === "string" ? params.protocolVersion : PROTOCOL,
          capabilities: { tools: {} },
          serverInfo: { name: "losscut-live", version: "1.0.0" },
          instructions: `You are ${display}, trading Live in Losscut!, a play-money FX parody: real prices, A$10,000 to start, until bankruptcy. Call market first. Prices are real; the money is not.`,
        }));
        continue;
      }
      if (name === "ping") {
        out.push(result(id, {}));
        continue;
      }
      if (!session) {
        out.push(error(id, -32001, "No session: send initialize first, then the Mcp-Session-Id it returns."));
        continue;
      }
      session.last = this.d.now();
      if (name === "tools/list") out.push(result(id, { tools: TOOLS }));
      else if (name === "tools/call") out.push(result(id, this.call(session, params ?? {})));
      else out.push(error(id, -32601, `Unknown method ${String(name)}.`));
    }
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (newId) headers["mcp-session-id"] = newId;
    if (!out.length) return { status: 202, headers, body: null };
    return { status: 200, headers, body: Array.isArray(message) ? out : out[0] };
  }

  // A tool call: the agent's choice turned into the action the page would send, answered as text it can read.
  private call(s: Session, params: Record<string, unknown>): { content: { type: "text"; text: string }[]; isError?: boolean } {
    const a = (params.arguments ?? {}) as Record<string, unknown>;
    const text = (t: string, isError = false) => ({ content: [{ type: "text" as const, text: t }], ...(isError ? { isError: true } : {}) });
    const p = a.pair;
    if ((params.name !== "market" || p !== undefined) && !this.d.isPair(p)) return text("Give a pair as BASE/QUOTE, such as AUD/USD.", true);
    if ((params.name === "market" || params.name === "history") && p !== undefined) {
      const refused = this.d.act(s.who, { mode: "live", kind: "pair", pair: p });
      if (refused) return text(refused, true);
    }
    if (params.name === "market") {
      return text(`${summary(this.d.view(s.who))}${p === undefined ? `\n\nCommon pairs: ${COMMON.join(", ")}. Any of the 42 orderings of EUR, GBP, AUD, USD, CHF, CNY and JPY works.` : ""}`);
    }
    if (params.name === "history") {
      const v = this.d.view(s.who);
      const all = (v.prices ?? []) as number[];
      const n = Math.max(1, Math.min(576, Math.round(num(a.count) ?? 96)));
      const closes = all.slice(-n);
      if (!closes.length) return text(`No prices for ${String(p)} yet.`, true);
      return text(`${String(p)}, ${closes.length} closes every 15 minutes, oldest first (high ${Math.max(...closes).toPrecision(5)}, low ${Math.min(...closes).toPrecision(5)}):\n${closes.map((x) => x.toPrecision(5)).join(", ")}`);
    }
    if (params.name === "pending" && a.side !== "buy" && a.side !== "sell") return text("Choose buy or sell for the pending order.", true);
    const now = this.d.now();
    if (now - s.acted < ACT_MS) return text("One action a second: wait a moment and try again.", true);
    s.acted = now;
    const exits = { sl: num(a.stop_loss), tp: num(a.take_profit) };
    let input: Record<string, unknown>;
    switch (params.name) {
      case "buy":
      case "sell":
        input = { kind: params.name, pair: p, leverage: a.leverage, share: a.margin, ...exits };
        break;
      case "close":
        input = { kind: "close", pair: p };
        break;
      case "pending":
        input = { kind: "pend", pair: p, side: a.side === "sell" ? -1 : 1, at: a.at, leverage: a.leverage, share: a.margin, ...exits };
        break;
      case "cancel_pending":
        input = { kind: "unpend", pair: p };
        break;
      default:
        return text(`Unknown tool ${String(params.name)}.`, true);
    }
    const refused = this.d.act(s.who, { mode: "live", ...input });
    if (refused) return text(refused, true);
    return text(`Done.\n\n${summary(this.d.view(s.who))}`);
  }
}

// Pairs a first-time agent can start from: the majors, the yen crosses Kurumi trades, and the Australian dollar at home.
const COMMON = ["AUD/USD", "EUR/USD", "USD/JPY", "GBP/USD", "AUD/JPY", "EUR/GBP", "USD/CHF", "USD/CNY"];
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const result = (id: string | number, r: unknown) => ({ jsonrpc: "2.0", id, result: r });
const error = (id: string | number | null, code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

// Live's view, for an agent to read: the market, the account and each position, plainly.
function summary(v: Record<string, unknown>): string {
  const you = (v.you ?? {}) as Record<string, unknown>;
  const prices = (v.prices ?? []) as number[];
  const recent = prices.slice(-12).map((x) => x.toPrecision(5)).join(", ");
  const positions = ((you.positions ?? []) as { pair: string; side: number; entry: number; leverage: number; margin?: number; pnl?: number }[])
    .map((x) => `  ${x.pair} ${x.side === 1 ? "long" : "short"} ${x.leverage}x from ${x.entry.toPrecision(5)}${x.pnl !== undefined ? `, P&L A$${Math.round(x.pnl)}` : ""}`);
  const pend = you.pending as { type: string; at: number } | null | undefined;
  const lines = [
    `${String(v.pair)} ${prices.length ? prices.at(-1)!.toPrecision(5) : "no price"}${v.live ? "" : typeof v.opens === "number" ? ` (market shut for the weekend: it opens ${new Date(v.opens).toISOString().replace(/:\d\d\.\d+Z$/, " UTC")}; orders wait until then)` : " (market shut for a moment: orders wait for the next live price)"}`,
    `Recent closes, every 15 minutes, oldest first: ${recent || "none"}`,
    `Account: net worth A$${Math.round(Number(you.equity ?? 0))}, cash A$${Math.round(Number(you.balance ?? 0))}${you.level != null ? `, margin level ${String(you.level)}%` : ""}${you.out ? ", closed until midnight in Sydney" : ""}`,
    positions.length ? `Positions:\n${positions.join("\n")}` : "No open positions.",
    pend ? `Pending on ${String(v.pair)}: ${pend.type} at ${pend.at}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}
