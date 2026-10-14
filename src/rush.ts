// ADR 0009, Fridge Rush. The door holds Scrabble's 98 letter magnets, each
// existing once. Players snatch letters into a tray of seven, may steal one
// from a rival's tray (then wait before stealing again), and spell words from
// their tray: a word scores its letters' values times (length - 2), once per
// round, for whoever plays it first, and its letters go back on the door. A
// round needs two players. The clock, dictionary and shuffle are passed in,
// so a test can run a round instantly and predictably.

// Scrabble's letter distribution, blanks left out.
const COUNTS: Record<string, number> = {
  a: 9, b: 2, c: 2, d: 4, e: 12, f: 2, g: 3, h: 2, i: 9, j: 1, k: 1, l: 4, m: 2,
  n: 6, o: 8, p: 2, q: 1, r: 6, s: 4, t: 6, u: 4, v: 2, w: 2, x: 1, y: 2, z: 1,
};
const VALUES: Record<string, number> = {
  a: 1, b: 3, c: 3, d: 2, e: 1, f: 4, g: 2, h: 4, i: 1, j: 8, k: 5, l: 1, m: 3,
  n: 1, o: 1, p: 3, q: 10, r: 1, s: 1, t: 1, u: 1, v: 4, w: 4, x: 8, y: 4, z: 10,
};

export const POOL: readonly string[] = Object.entries(COUNTS).flatMap(([ch, n]) => Array<string>(n).fill(ch));
export const value = (ch: string): number => VALUES[ch] ?? 0;
export const TRAY = 7;

export type Tile = { id: string; ch: string; x: number; y: number; cell?: number };

// The door is a grid of cells, more than there are letters, and a free tile
// sits in its own cell, so no letter ever hides under another. The door is
// 4:3, and each cell is wider and taller than a tile (rush.css).
const COLS = 14;
const ROWS = 10;
export type Played = { ok: true; word: string; points: number } | { ok: false; why: "not a word" | "not in your tray" | "taken" | "no round"; points?: undefined };
export type Ended = { ranking: [string, number][]; best: { who: string; word: string; points: number } | null };
export type State = { phase: "lobby" | "play" | "break"; endsAt: number; players: number };

export class Rush {
  private readonly door_ = new Map<string, Tile>();
  private readonly trays = new Map<string, Tile[]>();
  private readonly lastSteal = new Map<string, number>();
  readonly scores = new Map<string, number>();
  private readonly taken = new Set<string>();
  private best: Ended["best"] = null;
  private phase: State["phase"] = "lobby";
  private endsAt = 0;
  private readonly roundMs: number;
  private readonly breakMs: number;
  private readonly stealMs: number;
  private readonly words: ReadonlySet<string>;
  private readonly now: () => number;
  private readonly shuffle: <T>(xs: T[]) => T[];

  constructor(opts: {
    roundMs: number;
    breakMs: number;
    stealMs: number;
    words: ReadonlySet<string>;
    now?: () => number;
    shuffle?: <T>(xs: T[]) => T[];
  }) {
    this.roundMs = opts.roundMs;
    this.breakMs = opts.breakMs;
    this.stealMs = opts.stealMs;
    this.words = opts.words;
    this.now = opts.now ?? Date.now;
    this.shuffle = opts.shuffle ?? shuffle;
    this.scatter(POOL.map((ch, i) => ({ id: `t${i}`, ch, x: 0, y: 0 })));
  }

  join(who: string): void {
    if (!this.trays.has(who)) this.trays.set(who, []);
    if (this.phase === "lobby" && this.trays.size >= 2) this.start();
  }

  leave(who: string): void {
    const tray = this.trays.get(who);
    if (!tray) return;
    this.scatter(tray);
    this.trays.delete(who);
    this.scores.delete(who);
    if (this.trays.size < 2) this.phase = "lobby";
  }

  // Takes a letter off the door, first tap wins.
  snatch(who: string, id: string): boolean {
    const tray = this.trays.get(who);
    const tile = this.door_.get(id);
    if (this.phase !== "play" || !tray || !tile || tray.length >= TRAY) return false;
    this.door_.delete(id);
    tray.push(tile);
    return true;
  }

  // Takes a letter from a rival's tray; then the thief waits `stealMs`.
  steal(who: string, from: string, id: string): boolean {
    const mine = this.trays.get(who);
    const theirs = this.trays.get(from);
    if (this.phase !== "play" || !mine || !theirs || who === from || mine.length >= TRAY) return false;
    if (this.now() - (this.lastSteal.get(who) ?? -Infinity) < this.stealMs) return false;
    const i = theirs.findIndex((t) => t.id === id);
    if (i === -1) return false;
    mine.push(...theirs.splice(i, 1));
    this.lastSteal.set(who, this.now());
    return true;
  }

  // Puts a letter from the tray back on the door, to make room.
  drop(who: string, id: string): boolean {
    const tray = this.trays.get(who);
    const i = tray?.findIndex((t) => t.id === id) ?? -1;
    if (!tray || i === -1) return false;
    this.scatter(tray.splice(i, 1));
    return true;
  }

  play(who: string, word: string): Played {
    const tray = this.trays.get(who);
    word = word.toLowerCase();
    if (this.phase !== "play" || !tray) return { ok: false, why: "no round" };
    if (!this.words.has(word)) return { ok: false, why: "not a word" };
    const used: Tile[] = [];
    const left = [...tray];
    for (const ch of word) {
      const i = left.findIndex((t) => t.ch === ch);
      if (i === -1) return { ok: false, why: "not in your tray" };
      used.push(...left.splice(i, 1));
    }
    if (this.taken.has(word)) return { ok: false, why: "taken" };
    this.taken.add(word);
    const points = [...word].reduce((n, ch) => n + value(ch), 0) * Math.max(1, word.length - 2);
    this.scores.set(who, (this.scores.get(who) ?? 0) + points);
    if (!this.best || points > this.best.points) this.best = { who, word, points };
    this.trays.set(who, left);
    this.scatter(used);
    return { ok: true, word, points };
  }

  // Moves the round on: ends it on time, and starts the next after a break.
  tick(): Ended | null {
    const now = this.now();
    if (this.phase === "play" && now >= this.endsAt) {
      const ended: Ended = { ranking: [...this.scores].sort((a, b) => b[1] - a[1]), best: this.best };
      for (const tray of this.trays.values()) this.scatter(tray.splice(0));
      this.phase = "break";
      this.endsAt = now + this.breakMs;
      return ended;
    }
    if (this.phase === "break" && now >= this.endsAt) {
      if (this.trays.size >= 2) this.start();
      else this.phase = "lobby";
    }
    return null;
  }

  door(): Tile[] {
    return [...this.door_.values()];
  }

  tray(who: string): Tile[] {
    return [...(this.trays.get(who) ?? [])];
  }

  players(): string[] {
    return [...this.trays.keys()];
  }

  stealReadyAt(who: string): number {
    return (this.lastSteal.get(who) ?? -Infinity) + this.stealMs;
  }

  state(): State {
    return { phase: this.phase, endsAt: this.endsAt, players: this.trays.size };
  }

  private start(): void {
    this.phase = "play";
    this.endsAt = this.now() + this.roundMs;
    this.scores.clear();
    this.taken.clear();
    this.lastSteal.clear();
    this.best = null;
  }

  // Puts tiles back on the door, each in a random free cell.
  private scatter(tiles: Tile[]): void {
    const taken = new Set([...this.door_.values()].map((t) => t.cell));
    const free = this.shuffle([...Array(COLS * ROWS).keys()].filter((c) => !taken.has(c)));
    for (const t of tiles) {
      const cell = free.pop()!;
      t.cell = cell;
      t.x = (cell % COLS + 0.5) / COLS;
      t.y = (Math.floor(cell / COLS) + 0.5) / ROWS;
      this.door_.set(t.id, t);
    }
  }
}

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
