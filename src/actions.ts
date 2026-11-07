import type { Action } from "./bots.ts";

// Compatibility decoder: engines still decide whether the resulting choice is legal now.
// In particular, keep numeric coercion and defaults used by older pages.
export function tradeAction(input: Record<string, unknown>): Action | null {
  const kind = input.kind;
  const dist = (value: unknown): number | null => typeof value === "number" ? value : null;
  // the share of the account an order puts up; a page loaded before ADR 0091 sends it as stake, until it reloads
  const share = typeof input.share === "number" ? input.share : typeof input.stake === "number" ? input.stake : 1;
  if (kind === "buy" || kind === "sell") return { kind: "order", side: kind === "buy" ? 1 : -1, leverage: Number(input.leverage), share, sl: dist(input.sl), tp: dist(input.tp) };
  if (kind === "pray") return { kind, way: input.way === -1 ? -1 : 1 };
  if (kind === "close" || kind === "borrow" || kind === "repay" || kind === "unpend") return { kind };
  if (kind === "pend") return { kind, side: input.side === -1 ? -1 : 1, at: Number(input.at), leverage: Number(input.leverage), share, sl: dist(input.sl), tp: dist(input.tp) };
  if (kind === "stop" || kind === "take") return { kind, pct: dist(input.pct) };
  return null;
}
