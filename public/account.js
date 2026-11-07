import { element } from "./dom.js";
import { gauge, pct } from "./ticket.js";
/** @param {{ root: Document, cash: (amount: number) => string }} options */
export function createAccountPanel({ root, cash }) {
  /** @param {string} id */
  const $ = (id) => element(id, root);
  /** @param {number} n */
  const tone = (n) => (n > 0 ? "up" : n < 0 ? "down" : "");
  /** @param {import("./protocol.js").State} s @param {boolean} open */
  function render(s, open) {
    const y = s.you;
    // The account's totals, whichever pair is on the chart: in Live the margin in use is across every pair, in a
    // round it is the one position's.
    const totals = { worth: y.equity - y.debt, pnl: y.pnl, used: s.mode === "live" ? y.used ?? 0 : y.pos?.margin ?? 0, level: y.level, debt: y.debt };
    // Each amount with its change as a percentage, which is what a trader
    // reads: net worth against the starting money, open P&L against the
    // margin put up for it.
    const worth = totals.worth;
    $("equity").textContent = cash(worth);
    $("equity-pct").textContent = pct(worth / s.start - 1);
    $("equity-pct").className = `rate ${tone(worth - s.start)}`;
    $("pnl").textContent = cash(totals.pnl);
    // Toggled, not assigned: the tutorial may have a ring on this figure (ADR 0052).
    $("pnl").classList.toggle("up", totals.pnl > 0);
    $("pnl").classList.toggle("down", totals.pnl < 0);
    const usedMargin = totals.used;
    $("pnl-pct").textContent = usedMargin ? pct(totals.pnl / usedMargin) : "";
    $("pnl-pct").className = `rate ${tone(totals.pnl)}`;
    $("level").textContent = totals.level === null ? "—" : `${totals.level}%`;
    $("level-note").textContent = y.pos ? `${y.pos.leverage}×` : "";
    // The meter: net worth against the start, losses left, profit right,
    // on a log scale; with a position open, where its margin call and
    // losscut would land, at half and a fifth of its margin.
    const at = gauge(worth / s.start);
    const mid = 0.5;
    // Any change shows at least a sliver, so the side is always plain.
    const span = worth === s.start ? 0 : Math.max(0.015, Math.abs(at - mid));
    $("meter").style.left = `${(at < mid ? mid - span : mid) * 100}%`;
    $("meter").style.width = `${span * 100}%`;
    $("meter").className = `fill ${tone(worth - s.start)}`;
    /** @type {Record<string, number>} */
    const places = {};
    /** @type {[string, number][]} */
    const thresholds = [["mark-call", 0.5], ["mark-cut", 0.2]];
    for (const [id, share] of thresholds) {
      const show = usedMargin > 0 && open;
      $(id).hidden = !show;
      // Level is equity over margin, so at a level the equity is that share of it.
      if (!show) continue;
      const at = gauge((share * usedMargin - totals.debt) / s.start);
      places[id] = at;
      $(id).style.left = `${at * 100}%`;
      // near an end, the words hang inward from the mark so the bar's edge never cuts them
      $(id).dataset.edge = at < 0.12 ? "start" : at > 0.88 ? "end" : "";
    }
    // the call and the cut can sit close together; then the cut's words drop a line, so the two never run into each other
    $("mark-cut").classList.toggle("low", Math.abs((places["mark-call"] ?? 1) - (places["mark-cut"] ?? 0)) < 0.22);

  }
  return { render };
}
