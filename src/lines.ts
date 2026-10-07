// Finding lines of poetry on the door. The server never sees a word's size, so
// it estimates one: a magnet's font is 1.8% of the door's width (fridge.css),
// and fitted to every magnet as rendered, a word is 0.433em a letter plus
// 0.917em of padding, to within 0.66em. Padding adds 0.45em down, and the door
// is 4:3, so a height in door widths is 4/3 of itself in door heights.
const EM = 0.018;
export const width = (text: string): number => (text.length * 0.433 + 0.917) * EM;
const HEIGHT = ((1.15 + 0.45) * EM * 4) / 3;

// Neighbours in a line sit on the same row (tops within half a magnet) with a
// gap of at most about two letters. Both bounds allow for the estimate's error,
// so words placed touching, or slightly overlapping, still count.
const SAME_ROW = HEIGHT / 2;
const GAP_MIN = -1 * EM;
const GAP_MAX = 2.5 * EM;

// Fewer words than this is a fragment, not a line.
export const MIN_WORDS = 3;

export type Placed = { id: string; text: string; x: number; y: number };

// Each line is its magnets left to right. A magnet belongs to at most one line.
export function lines(placed: readonly Placed[]): Placed[][] {
  const next = new Map<string, Placed>();
  for (const a of placed) {
    let best: Placed | null = null;
    let bestGap = Infinity;
    for (const b of placed) {
      if (b === a || Math.abs(b.y - a.y) > SAME_ROW) continue;
      const gap = b.x - (a.x + width(a.text));
      if (gap >= GAP_MIN && gap <= GAP_MAX && b.x > a.x && gap < bestGap) {
        best = b;
        bestGap = gap;
      }
    }
    if (best) next.set(a.id, best);
  }
  // Two words can't both follow the same one: keep the chain from whichever
  // is nearer, so every magnet has at most one predecessor.
  const prev = new Map<string, Placed>();
  for (const a of placed) {
    const b = next.get(a.id);
    if (!b) continue;
    const other = prev.get(b.id);
    if (!other || other.x < a.x) {
      if (other) next.delete(other.id);
      prev.set(b.id, a);
    } else next.delete(a.id);
  }
  const found: Placed[][] = [];
  for (const a of placed) {
    if (prev.has(a.id)) continue;
    const line = [a];
    for (let b = next.get(a.id); b; b = next.get(b.id)) line.push(b);
    if (line.length >= MIN_WORDS) found.push(line);
  }
  return found;
}

// The words as a reader sees them: an ending magnet joins the word before it,
// so "moon -s" reads "moons".
export const text = (line: readonly Placed[]): string =>
  line
    .map((m) => m.text)
    .join(" ")
    .replace(/ -/g, "");
