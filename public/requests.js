/** @param {unknown} value @returns {number} */
function number(value) { if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Invalid action number"); return value; }
/** @param {unknown} value */
function distance(value) { return value == null ? null : number(value); }
/** @param {string} kind @param {Record<string, unknown>} fields @returns {import("./protocol.js").TradeAction | null} */
function trade(kind, fields) {
  if (kind === "buy" || kind === "sell") return { kind, leverage: number(fields.leverage), stake: fields.stake === undefined ? 1 : number(fields.stake), sl: distance(fields.sl), tp: distance(fields.tp) };
  if (kind === "close" || kind === "borrow" || kind === "repay") return { kind };
  if (kind === "stop" || kind === "take") return { kind, pct: distance(fields.pct) };
  return null;
}
/** @param {import("./protocol.js").Mode} mode @param {string} kind @param {Record<string, unknown>} [fields] @returns {import("./protocol.js").Action} */
export function makeAction(mode, kind, fields = {}) {
  const chosen = trade(kind, fields);
  if (mode === "marathon") {
    if (kind === "pair" && typeof fields.pair === "string") return { mode, kind, pair: fields.pair };
    if (chosen) return { mode, ...chosen, ...(typeof fields.pair === "string" ? { pair: fields.pair } : {}) };
  } else if (mode === "tutorial") {
    if (kind === "stop" && typeof fields.pct === "number") return { mode, kind, pct: number(fields.pct) };
    if (kind === "play" || kind === "pause" || kind === "stop" || kind === "skip" || kind === "back" || kind === "again" || kind === "restart" || kind === "next") return { mode, kind };
    if (chosen) return { mode, ...chosen };
  } else {
    if (chosen) return { mode, ...chosen };
    if (kind === "start") return { mode, kind, ironman: fields.ironman === true };
    if (kind === "pause" || kind === "resume" || kind === "finish" || kind === "fast" || kind === "normal" || kind === "cancel" || kind === "hold" || kind === "dismiss" || kind === "unpend") return { mode, kind };
    if (kind === "choose" && (typeof fields.what === "number" || typeof fields.what === "string")) return { mode, kind, what: fields.what };
    if (kind === "guess") return { mode, kind, year: number(fields.year) };
    if (kind === "pray") return { mode, kind, way: fields.way === -1 ? -1 : 1 };
    if (kind === "pend") return { mode, kind, side: fields.side === -1 ? -1 : 1, at: number(fields.at), leverage: number(fields.leverage), stake: number(fields.stake), sl: distance(fields.sl), tp: distance(fields.tp) };
  }
  throw new Error("Invalid action for mode");
}
/** @param {import("./protocol.js").Action} action */
export function sendAction(action) {
  return fetch("/api/act", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(action) });
}
