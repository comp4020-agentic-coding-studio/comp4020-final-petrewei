// Pictures for the page (ADR 0025): an emoji for each kind of feed line
// and pop-up, so a glance tells a win from a cut, and a few pixel-art
// props drawn by hand on the faces' 16×16 grid (ADR 0021), for the
// moments that deserve one: the bell, a pause, a losscut, a loan, a win.

export const ICONS = {
  news: {
    started: "🚦", cancelled: "🛑", ironman: "🦾", paused: "☕", resumed: "▶️", unpaused: "⏰", finished: "🏁", left: "🚪",
    "live-round": "📡", "replay-round": "📼",
    bought: "📈", sold: "📉", added: "➕", closed: "💴", stopped: "🛡️",
    call: "📞", stopout: "💀", zerocut: "🕳️", prayed: "🙏", borrowed: "🐷", "borrowed-again": "🐽", entered: "👋",
    "you-bought": "📈", "you-sold": "📉", "you-closed": "💴", "you-stopped": "🛡️", "you-call": "📞", "you-stopout": "💀", "you-zerocut": "🕳️",
  },
  pops: { wild: "🎰", add: "➕", call: "📞", stopout: "💀", zerocut: "🕳️", borrow: "🐷" },
};

// k is the outline and w white, in every prop; each adds its own colours.
const BASE = { k: "#2b1d24", w: "#ffffff" };

export const PROPS = {
  // The closing bell, swinging.
  bell: {
    colors: { y: "#f2c14e", Y: "#c8902a", l: "#fff1b8", r: "#8a5a1a" },
    rows: [
      "......kkkk......",
      ".....kyyyyk.....",
      "......kyyk......",
      ".....kkyykk.....",
      "....kyllyyyk....",
      "...kyllyyyyyk...",
      "...kylyyyyyyk...",
      "..kyylyyyyyyyk..",
      "..kyyyyyyyyyyk..",
      "..kyyyyyyyyyYk..",
      ".kyyyyyyyyyyYYk.",
      ".kyyyyyyyyyyYYk.",
      "kkkkkkkkkkkkkkkk",
      "kYYYYYYYYYYYYYYk",
      "kkkkkkkrrkkkkkkk",
      ".......kkk......",
    ],
  },
  // A cup of tea while the market is paused.
  pause: {
    colors: { c: "#f4eee6", C: "#cfc4b8", t: "#9a5a2a", s: "#c9c9d6" },
    rows: [
      "......s...s.....",
      ".....s...s......",
      "......s...s.....",
      ".....s...s......",
      "................",
      "..kkkkkkkkkkk...",
      "..kttttttttttk..",
      "..kcccccccccckkk",
      "..kcccccccccck.k",
      "..kcccccccccck.k",
      "..kccccccccCckkk",
      "...kccccccCck...",
      "...kcccccCCck...",
      "....kkkkkkkk....",
      ".kkkkkkkkkkkkkk.",
      "..kkkkkkkkkkkk..",
    ],
  },
  // The forced losscut: a skull.
  skull: {
    colors: { b: "#efe9e1", B: "#c9bfb2", e: "#e0336f" },
    rows: [
      "................",
      "....kkkkkkkk....",
      "...kbbbbbbbbk...",
      "..kbbbbbbbbbbk..",
      "..kbbbbbbbbbbk..",
      "..kbkkkbbkkkbk..",
      "..kbkeekbkeekk..",
      "..kbkkkbbkkkbk..",
      "..kbbbbkkbbbbk..",
      "...kbbbbbbbbk...",
      "...kBbkbkbkBk...",
      "....kbbbbbbk....",
      "....kBkBkBkk....",
      ".....kkkkkk.....",
      "................",
      "................",
    ],
  },
  // Dad's savings, for a loan.
  piggy: {
    colors: { p: "#ff9fb8", P: "#e0708f", c: "#f2c14e" },
    rows: [
      "................",
      "......kkkk......",
      ".....kcccck.....",
      "......kkkk......",
      "...kkkkkkkkkk...",
      "..kppppppppppk..",
      ".kpppkpppppppPk.",
      ".kpppppppppppPkk",
      "kkppppppppppppPk",
      "kPpppppppppppPPk",
      "kkppppppppppppkk",
      ".kPpppppppppPPk.",
      "..kPPPPPPPPPPk..",
      "..kpk.....kpk...",
      "..kkk.....kkk...",
      "................",
    ],
  },
  // A trophy for the round's winner.
  trophy: {
    colors: { y: "#f2c14e", Y: "#c8902a", l: "#fff1b8", b: "#6a4a8a" },
    rows: [
      "................",
      "..kkkkkkkkkkkk..",
      ".kkyyllyyyyyykk.",
      "kykylyyyyyyyykyk",
      "kyk.kyyyyyyyk.ky",
      ".kykkyyyyyyYkkyk",
      "..kkkyyyyyyYkkk.",
      ".....kyyyyYk....",
      "......kyyYk.....",
      ".......kyk......",
      ".......kYk......",
      ".....kkkkkkk....",
      "....kbbbbbbbk...",
      "....kbbwwwbbk...",
      "....kkkkkkkkk...",
      "................",
    ],
  },
  // An iron fist, for ironman.
  fist: {
    colors: { m: "#b8c0cc", M: "#7e8796", l: "#eef2f7" },
    rows: [
      "................",
      "....kkkkkkkk....",
      "...kmlmmlmmlk...",
      "..kkmlmkmlmkmk..",
      "..kmmmmkmmmkmk..",
      "..kmmmmkmmmkmk..",
      "..kkkkkkkkkkMk..",
      "..kmlmmmmmmmMk..",
      "..kmmmmmmmmmMk..",
      "...kmmmmmmmMk...",
      "...kMmmmmmMMk...",
      "....kMMMMMMk....",
      "....kmmmmmmk....",
      "....kmlmmmmk....",
      "....kkkkkkkk....",
      "................",
    ],
  },
};

// A prop as an SVG, one rectangle per run of a colour along a row; an
// unknown prop draws nothing.
export function prop(id, size = 32) {
  const p = PROPS[id];
  if (!p) return "";
  const fill = { ...BASE, ...p.colors };
  const rects = [];
  p.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      const ch = row[x];
      let n = 1;
      while (row[x + n] === ch) n++;
      if (ch !== "." && fill[ch]) rects.push(`<rect x="${x}" y="${y}" width="${n}" height="1" fill="${fill[ch]}"/>`);
      x += n;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="${size}" height="${size}" shape-rendering="crispEdges" aria-hidden="true">${rects.join("")}</svg>`;
}
