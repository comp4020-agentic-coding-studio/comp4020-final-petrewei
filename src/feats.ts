// Achievements (ADR 0082): a dozen moments a player can reach, awarded by the server from what the desk did, never by
// a page, and kept with the career, so they last across rounds and restarts. Each is earned once. The page shows the
// ones not yet earned as a question mark and a hint, in the player's language.
import type { Fill } from "./fx.ts";

export const FEATS = ["first", "win", "diamond", "cut", "void", "credit", "debtFree", "bankrupt", "patient", "swan", "historian", "maxLev"] as const;
export type Feat = (typeof FEATS)[number];

// What a fill earns its trader, given whether the position it ends went through a margin call.
export function fromFill(f: Fill, called: boolean): Feat[] {
  const out: Feat[] = [];
  const closed = f.kind === "close" || f.kind === "stop" || f.kind === "take";
  if (closed || f.kind === "stopout" || f.kind === "zerocut") out.push("first");
  if (closed && f.pnl > 0) out.push("win");
  // held through a margin call, and still closed in profit
  if (closed && f.pnl > 0 && called) out.push("diamond");
  if (f.kind === "stopout") out.push("cut");
  if (f.kind === "zerocut") out.push("void");
  if ((f.kind === "open" || f.kind === "add") && f.pending) out.push("patient");
  if ((f.kind === "open" || f.kind === "add") && f.leverage === 1000) out.push("maxLev");
  return out;
}

// What the bell earns a trader who traded: a rewind ended up, the year named exactly, or a round ended owing more than
// they had.
export function fromBell(r: { rewind: boolean; net: number; start: number; yearRight: boolean }): Feat[] {
  const out: Feat[] = [];
  if (r.net < 0) out.push("bankrupt");
  if (r.rewind && r.net > r.start) out.push("swan");
  if (r.rewind && r.yearRight) out.push("historian");
  return out;
}

// What a credit action earns: the first draw, and a repayment that clears the debt.
export function fromCredit(kind: "borrow" | "repay", debtAfter: number): Feat[] {
  if (kind === "borrow") return ["credit"];
  return debtAfter === 0 ? ["debtFree"] : [];
}
