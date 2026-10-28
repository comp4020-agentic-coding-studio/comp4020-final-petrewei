// Pictures for the page (ADR 0025): an emoji for each kind of feed line
// (a tutorial's "you-" line wears its plain kind's)
// and pop-up, so a glance tells a win from a cut, and a few pixel-art
// props drawn by hand on the faces' 16×16 grid (ADR 0021), for the
// moments that deserve one: the bell, a pause, a losscut, a loan, a win.

import { pixels } from "./avatars.js";

export const ICONS = {
  news: {
    headline: "📰", clue: "📰", started: "🚦", cancelled: "🛑", ironman: "🦾", paused: "☕", resumed: "▶️", unpaused: "⏰", finished: "🏁",
    "scenario-round": "📡", "replay-round": "📼",
    bought: "📈", sold: "📉", added: "➕", closed: "💴", stopped: "🛡️", took: "🎯",
    call: "📞", stopout: "💀", zerocut: "🕳️", prayed: "🙏", borrowed: "🐷", "borrowed-again": "🐽", caught: "🚨", entered: "👋",
  },
  pops: { wild: "🎰", add: "➕", call: "📞", stopout: "💀", zerocut: "🕳️", borrow: "🐷", caught: "🚨" },
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

// A prop as an SVG, drawn like a face; an unknown prop draws nothing.
export const prop = (id, size = 32) => (PROPS[id] ? pixels(PROPS[id], size, BASE) : "");
