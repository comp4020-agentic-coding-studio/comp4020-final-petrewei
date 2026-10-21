// Pixel-art faces (ADR 0021): one for each house trader, drawn here by
// hand on a 16×16 grid after the comic's colours and hairstyles, and a
// handful of plain ones a person is dealt from their cookie, as their
// name is. No official art is copied or traced; each face is these rows.
// The server and the page share this file: the server deals the faces,
// the page draws them as SVG.

// Shared colours. Each face adds its hair (h, l light, d dark), eyes (e),
// clothes (c, C) and an accent (r, b).
const BASE = { k: "#2b1d24", s: "#ffe4d2", p: "#ff9fb0", m: "#c8455c", w: "#ffffff", g: "#3a3040" };

// Faces of the house traders, by bot id.
export const BOTS = {
  // Pink bob, a hair clip, pink-red eyes, a white shirt with a red bow.
  "bot:kurumi": {
    colors: { h: "#f27aa6", l: "#ffc2d9", d: "#c94f84", e: "#e0336f", c: "#ffffff", C: "#d8d4dc", r: "#d8344f" },
    rows: [
      "................",
      ".....kkkkkk.....",
      "...kkhhhhhhkk...",
      "..khhlhhhhhhhk..",
      ".khhlhhhhhhwwhk.",
      ".khhhhhhhhhhhhk.",
      ".khhhhhhhhhhhhk.",
      ".khhshhhhhhshhk.",
      ".khsssshhsssshk.",
      ".khskksssskkshk.",
      ".khseesssseeshk.",
      ".khpssssssssphk.",
      ".khdsssmmsssdhk.",
      ".kdddkssssskdddk",
      "..kkCCkssskCCkk.",
      ".kccccccrrcccck.",
    ],
  },
  // Purple hair swept over one side, violet eyes, a black choker.
  "bot:mochiko": {
    colors: { h: "#b65ad0", l: "#e3a6f0", d: "#7d3a9a", e: "#8a3cc8", c: "#2c2a35", C: "#4a4656", r: "#1d1820" },
    rows: [
      "................",
      ".....kkkkkk.....",
      "...kkhhhhhhkk...",
      "..khhhhhhlhhhk..",
      ".khhhhhhhhlhhhk.",
      ".khhhhhhhhhhhhk.",
      ".khhhhhhhhhhhhk.",
      ".khshhhhhhhhhhk.",
      ".khssssshhhhshk.",
      ".khskkssskkhshk.",
      ".khseesssseeshk.",
      ".khpssssssssphk.",
      ".khhssssmssshhk.",
      ".khhhkrrrrkhhhk.",
      ".khdhkkssskhdhk.",
      ".kdcccccccccdk..",
    ],
  },
  // Black twin tails with white rabbit clips and red crossed pins, red
  // eyes, a fang, a black choker.
  "bot:yasuko": {
    colors: { h: "#2d3346", l: "#6f7fa0", d: "#191c28", e: "#e0303c", c: "#2a2a30", C: "#eeeeee", r: "#e23a3a", b: "#ffffff" },
    rows: [
      "..b.b......b.b..",
      "..bpb......bpb..",
      ".kbbbkkkkkkbbbk.",
      ".kbkbhhhhhhbkbk.",
      "..khhhhhhhhhhk..",
      ".khrhhhhhhhhrhk.",
      "khhhrhhhhhhrhhhk",
      "khhshhhhhhhhshhk",
      "khhssshhhhssshhk",
      "khhskkssssskkshk",
      "khhseesssseeshhk",
      "kdhpssssssssphdk",
      "kdhhssswmsssshdk",
      "kdd.kkrrrrkk.ddk",
      ".kd..kssssk..dk.",
      "..kcccCccCccck..",
    ],
  },
  // Messy short blonde hair, yellow-green eyes, a pout, a pale green tee.
  "bot:mebuki": {
    colors: { h: "#f7c95a", l: "#fff0b0", d: "#d9a23c", e: "#a8b020", c: "#e6f3d6", C: "#c8dcb4" },
    rows: [
      "................",
      "....kk.kkkk.....",
      "..kkhhkhhhhkk...",
      ".khhhlhhhhhhhkk.",
      "khhlhhhhhhhlhhhk",
      "khhhhhhhhhhhhhhk",
      ".khhhhhhhhhhhhk.",
      "khhhshhhhhhshhhk",
      ".khsshhsshhsshk.",
      ".khskksssskkshk.",
      ".khseesssseeshk.",
      ".khpssssssssphk.",
      "khdssssmmssssdhk",
      ".kd.kssssssk.dk.",
      "..k.kkssssskk.k.",
      "..kcccccccccck..",
    ],
  },
  // Very long straight black hair with a blue sheen, blue eyes looking
  // down, a dark blazer.
  "bot:inago": {
    colors: { h: "#1f2233", l: "#4a63a8", d: "#11131d", e: "#3a76d8", c: "#26304a", C: "#ffffff" },
    rows: [
      "................",
      ".....kkkkkk.....",
      "...kkhhhhhhkk...",
      "..khhhlllhhhhk..",
      ".khhhhhhhhhhhhk.",
      ".khhhhhhhhhhhhk.",
      ".khhhhhhhhhhhhk.",
      ".khhhhhhhhhhhhk.",
      ".khhssshhssshhk.",
      ".khsssssssssshk.",
      ".khskksssskkshk.",
      ".khseesssseeshk.",
      ".khpssssssssphk.",
      ".khhhkssmskhhhk.",
      ".khhhkCkkCkhhhk.",
      ".kdhkccCCcckhdk.",
    ],
  },
  // A dark brown bob with a red streak, round glasses, red eyes, a
  // mustard cardigan over the shoulders.
  "bot:nana": {
    colors: { h: "#4a2e26", l: "#7a5246", d: "#2e1b16", e: "#d8343c", c: "#ffffff", C: "#e0b33c", r: "#d63a3a" },
    rows: [
      "................",
      ".....kkkkkk.....",
      "...kkhhhhhhkk...",
      "..khhhhhhrhhhk..",
      ".khhlhhhhhrhhhk.",
      ".khhhhhhhhhrhhk.",
      ".khhhhhhhhhhhhk.",
      ".khhshhhhhhshhk.",
      ".khsssshhsssshk.",
      ".khggggssggggk..",
      ".kgseegggseegsk.",
      ".khggggssggggk..",
      ".khpsssmmssspk..",
      ".kdddksssskddk..",
      ".kCCCkksskkCCCk.",
      "kCCCCcccccCCCCk.",
    ],
  },
  // Blonde hair in a bun on top, long bangs, yellow eyes, a beauty mark,
  // a cream sleeveless turtleneck.
  "bot:kizuna": {
    colors: { h: "#f2cf6e", l: "#fff3c0", d: "#c99a3a", e: "#e3a81a", c: "#f2e6cf", C: "#d8c8a8", r: "#5a3a2a" },
    rows: [
      "......kkkk......",
      ".....khhlhk.....",
      ".....khhhhk.....",
      "....kkkkkkkk....",
      "...khhhhhhlhk...",
      "..khhhhhhhhhhk..",
      ".khhhhhhhhhhhhk.",
      ".khhhhshhshhhhk.",
      ".khhsssssssshhk.",
      ".khskksssskkshk.",
      ".khseesssseeshk.",
      ".khpsrssssssphk.",
      ".khhssssmssshhk.",
      ".khhhkccccckhhk.",
      ".khhkccccccckhk.",
      "..ksssccCccssk..",
    ],
  },
};

// Faces a person may be dealt. Each is a hairstyle in a colour, dressed
// in a colour; with the name, they tell the people in a room apart.
const STYLES = {
  short: [
    "................",
    ".....kkkkkk.....",
    "...kkhhhhhhkk...",
    "..khhlhhhhhhhk..",
    ".khhlhhhhhhhhhk.",
    ".khhhhhhhhhhhhk.",
    ".khshhhhhhhhshk.",
    ".khssshhhhsssk..",
    ".kssssssssssssk.",
    ".kssksssssskssk.",
    ".ksseesssseessk.",
    ".kspssssssssspk.",
    "..kssssmmssssk..",
    "...kksssssskk...",
    "....kkssssk.....",
    "..kccccccccccck.",
  ],
  ponytail: [
    "................",
    ".....kkkkkk.....",
    "...kkhhhhhhkk...",
    "..khhlhhhhhhhkk.",
    ".khhlhhhhhhhhhkk",
    ".khhhhhhhhhhhhkd",
    ".khhhhhhhhhhhhkd",
    ".khhshhhhhhshhkd",
    ".khsssshhsssshkd",
    ".khskksssskkshkd",
    ".khseesssseeshkd",
    ".khpssssssssphk.",
    "..khssssmssshk..",
    "...kksssssskk...",
    "....kkssssk.....",
    "..kccccccccccck.",
  ],
  cap: [
    "................",
    ".....kkkkkk.....",
    "...kkrrrrrrkk...",
    "..krrrrbbrrrrk..",
    ".krrrrrrrrrrrrk.",
    ".kkkkkkkkkkkkkkk",
    ".khhhhhhhhhhhk..",
    ".khssshhssshhk..",
    ".kssssssssssssk.",
    ".kssksssssskssk.",
    ".ksseesssseessk.",
    ".kspssssssssspk.",
    "..ksssmmmsssk...",
    "...kksssssskk...",
    "....kkssssk.....",
    "..kccccccccccck.",
  ],
  long: [
    "................",
    ".....kkkkkk.....",
    "...kkhhhhhhkk...",
    "..khhhhhlhhhhk..",
    ".khhhhhhhlhhhhk.",
    ".khhhhhhhhhhhhk.",
    ".khhhhhhhhhhhhk.",
    ".khhshhhhhhshhk.",
    ".khsssshhsssshk.",
    ".khskksssskkshk.",
    ".khseesssseeshk.",
    ".khpssssssssphk.",
    ".khhssssmssshhk.",
    ".khhhkssssskhhk.",
    ".khhhkkssskkhhk.",
    ".kdhkccccccckdk.",
  ],
  glasses: [
    "................",
    ".....kkkkkk.....",
    "...kkhhhhhhkk...",
    "..khhlhhhhhhhk..",
    ".khhlhhhhhhhhhk.",
    ".khhhhhhhhhhhhk.",
    ".khhhhhhhhhhhhk.",
    ".khshhhhhhhhshk.",
    ".khsssshhsssshk.",
    ".kgggggssgggggk.",
    ".kgseegggseegsk.",
    ".kgggggssgggggk.",
    "..kpsssmmssspk..",
    "...kksssssskk...",
    "....kkssssk.....",
    "..kccccccccccck.",
  ],
};
const HAIR = [
  { h: "#3b2a24", l: "#6a4c40", d: "#231812" },
  { h: "#e0a040", l: "#ffd890", d: "#b07020" },
  { h: "#5a7ad8", l: "#a0b8ff", d: "#3a52a0" },
  { h: "#3a8a5a", l: "#80c898", d: "#22603a" },
  { h: "#c84a3a", l: "#f08a78", d: "#902a20" },
  { h: "#d8d8e0", l: "#ffffff", d: "#9a9aa8" },
  { h: "#7a4ab8", l: "#b090e0", d: "#52307e" },
  { h: "#222228", l: "#5a5a68", d: "#101014" },
];
const EYES = ["#3a76d8", "#3a9a5a", "#7a4a2a", "#c8455c"];
const CLOTHES = ["#4a78c8", "#e07a3a", "#3aa07a", "#8a5ac8", "#d8455a", "#5a6478"];
const CAPS = [{ r: "#d8455a", b: "#ffffff" }, { r: "#3a6ac8", b: "#ffd84a" }];

// Twelve plain faces, fixed so that each person keeps theirs.
export const PEOPLE = [
  ["short", 0, 0, 0],
  ["ponytail", 1, 1, 1],
  ["cap", 7, 2, 2],
  ["long", 2, 0, 3],
  ["glasses", 0, 2, 4],
  ["short", 4, 1, 5],
  ["ponytail", 6, 3, 2],
  ["long", 3, 1, 0],
  ["glasses", 5, 0, 1],
  ["cap", 1, 3, 3],
  ["short", 5, 3, 4],
  ["long", 7, 2, 5],
].map(([style, hair, eye, cloth], i) => ({
  colors: { ...HAIR[hair], e: EYES[eye], c: CLOTHES[cloth], C: CLOTHES[cloth], d: HAIR[hair].d, ...CAPS[i % 2] },
  rows: STYLES[style],
}));

// A face by name: a bot's id, or "p" and a number for a person's.
export function face(id) {
  if (BOTS[id]) return BOTS[id];
  const n = /^p(\d+)$/.exec(id ?? "");
  return n ? PEOPLE[Number(n[1]) % PEOPLE.length] : PEOPLE[0];
}

// The face as an SVG.
export const svg = (id, size = 20) => pixels(face(id), size, BASE);

// Any 16×16 drawing as an SVG, one rectangle per run of a colour along a
// row; crispEdges keeps the pixels square at any size. The props (art.js)
// are drawn by it too.
export function pixels({ colors, rows }, size, base) {
  const fill = { ...base, ...colors };
  const rects = [];
  rows.forEach((row, y) => {
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
