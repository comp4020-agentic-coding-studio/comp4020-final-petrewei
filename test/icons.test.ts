import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

// The Settings gear is drawn by hand. Its outline once sat a unit above its centre circle, so the circle looked low, and
// the outline did not close where it began. This reads the icon as a browser would, and checks it is a closed shape
// centred on its own circle.
const svg = readFileSync("public/parts/feats.html", "utf8").match(/id="settings-btn"[\s\S]*?<\/svg>/)![0];

// The outline's own points: every segment's end, from a path of M, h, v, l, a and z commands.
function points(d: string): [number, number][] {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+/g)!;
  const out: [number, number][] = [];
  let x = 0, y = 0, i = 0, cmd = "";
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    if (cmd === "z" || cmd === "Z") continue;
    if (cmd === "M") [x, y] = [num(), num()];
    else if (cmd === "h") x += num();
    else if (cmd === "v") y += num();
    else if (cmd === "l") { x += num(); y += num(); }
    else if (cmd === "a") { i += 5; x += num(); y += num(); }
    else throw new Error(`the gear uses a path command this check does not read: ${cmd}`);
    out.push([x, y]);
  }
  return out;
}

it("draws the Settings gear closed, and centred on its own circle", () => {
  const d = svg.match(/<path d="([^"]+)"/)![1];
  const circle = svg.match(/<circle cx="([\d.]+)" cy="([\d.]+)"/)!;
  const [cx, cy] = [Number(circle[1]), Number(circle[2])];
  const pts = points(d);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  expect((Math.min(...xs) + Math.max(...xs)) / 2, "the outline is centred across").toBeCloseTo(cx, 1);
  expect((Math.min(...ys) + Math.max(...ys)) / 2, "the outline is centred down, so the circle is not low").toBeCloseTo(cy, 1);
  // a path closes with z (a line back to its start) or by ending on its start; either way no side is left open
  expect(/z\s*$/i.test(d) || Math.hypot(pts[pts.length - 1][0] - pts[0][0], pts[pts.length - 1][1] - pts[0][1]) < 0.15, "the outline is closed").toBe(true);
  // and the last side before z is no longer than a tooth's own edge, so nothing is cut short
  const [sx, sy] = pts[0], [ex, ey] = pts[pts.length - 1];
  const sides = pts.slice(1).map((p, k) => Math.hypot(p[0] - pts[k][0], p[1] - pts[k][1]));
  expect(Math.hypot(ex - sx, ey - sy), "the closing side is as short as the others").toBeLessThanOrEqual(Math.max(...sides));
});
