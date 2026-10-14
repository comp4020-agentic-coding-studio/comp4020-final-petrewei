// ADR 0008, rounds with a prompt. A round lasts a few minutes and opens with a
// prompt the server can check from a line's words alone. While a line of three
// or more words stands, its owner earns a point per word per second, doubled
// if the line answers the prompt; taking a word from it stops that, and may
// hand the line to someone else. A break with the ranking follows each round.
// The clock is passed in so a test can run a round without waiting for it.
import { MIN_WORDS } from "./lines.ts";

export type Word = { id: string; text: string; movedBy: string | null };

export type Prompt = { id: string; text: string; test: (words: readonly string[]) => boolean };

const has = (set: readonly string[]) => (words: readonly string[]) => words.some((w) => set.includes(w));

// Each answerable with the vocabulary in src/words.ts.
export const PROMPTS: readonly Prompt[] = [
  { id: "colour", text: "a line with a colour in it", test: has(["blue", "bright", "dark"]) },
  { id: "time", text: "a line about a time of day or year", test: has(["morning", "night", "winter", "summer", "today", "tomorrow", "yesterday", "Tuesday", "late", "early"]) },
  { id: "weather", text: "a line with weather in it", test: has(["rain", "storm", "sun", "sky", "cold", "warm"]) },
  { id: "someone", text: "a line about someone", test: has(["you", "we", "they", "he", "she", "her", "him", "us", "me", "friend", "stranger", "nobody"]) },
  { id: "home", text: "a line set at home", test: has(["home", "kitchen", "room", "door", "window", "kettle", "toast", "bread", "coffee"]) },
  { id: "long", text: "a line of five words or more", test: (words) => words.length >= 5 },
  { id: "question", text: "a line that asks a question", test: has(["what", "who", "when", "where", "why", "if"]) },
];

// Whoever placed most of a line's words owns it; on a tie, whoever placed
// its last word. Words nobody has moved never form a line (src/server.ts).
export function owner(line: readonly Word[]): string | null {
  const counts = new Map<string, number>();
  for (const w of line) if (w.movedBy) counts.set(w.movedBy, (counts.get(w.movedBy) ?? 0) + 1);
  const most = Math.max(0, ...counts.values());
  const tied = [...counts].filter(([, n]) => n === most).map(([who]) => who);
  if (tied.length <= 1) return tied[0] ?? null;
  for (let i = line.length - 1; i >= 0; i--) if (tied.includes(line[i].movedBy!)) return line[i].movedBy;
  return null;
}

export type Ended = { prompt: string; ranking: [string, number][] };
export type State = { phase: "play" | "break"; prompt: string; endsAt: number; scores: [string, number][] };

export class Game {
  readonly scores = new Map<string, number>();
  private phase: "play" | "break" = "play";
  private prompt: Prompt;
  private endsAt: number;
  private lastAt: number;
  private standing: Word[][] = [];
  private readonly roundMs: number;
  private readonly breakMs: number;
  private readonly now: () => number;
  private readonly pick: () => Prompt;

  constructor({
    roundMs,
    breakMs,
    now = Date.now,
    pick = () => PROMPTS[Math.floor(Math.random() * PROMPTS.length)],
  }: { roundMs: number; breakMs: number; now?: () => number; pick?: () => Prompt }) {
    this.roundMs = roundMs;
    this.breakMs = breakMs;
    this.now = now;
    this.pick = pick;
    this.prompt = pick();
    this.endsAt = now() + roundMs;
    this.lastAt = now();
  }

  // Credits the lines that stood since the last call, up to the end of the
  // round, then takes `lines` as what stands from now on. Call it whenever
  // the door changes and on a timer. Returns the result if a round just ended.
  score(lines: Word[][]): Ended | null {
    const now = this.now();
    let ended: Ended | null = null;
    if (this.phase === "play") {
      this.credit(Math.min(now, this.endsAt) - this.lastAt);
      if (now >= this.endsAt) {
        ended = { prompt: this.prompt.text, ranking: [...this.scores].sort((a, b) => b[1] - a[1]) };
        this.phase = "break";
        this.endsAt += this.breakMs;
      }
    } else if (now >= this.endsAt) {
      this.scores.clear();
      this.phase = "play";
      this.prompt = this.pick();
      this.endsAt = now + this.roundMs;
    }
    this.lastAt = now;
    this.standing = lines;
    return ended;
  }

  // Whether a line answers the current prompt, for drawing it on the page.
  answers(line: readonly Word[]): boolean {
    return this.prompt.test(line.map((w) => w.text));
  }

  state(): State {
    return { phase: this.phase, prompt: this.prompt.text, endsAt: this.endsAt, scores: [...this.scores].sort((a, b) => b[1] - a[1]) };
  }

  private credit(ms: number): void {
    if (ms <= 0) return;
    for (const line of this.standing) {
      if (line.length < MIN_WORDS) continue;
      const who = owner(line);
      if (!who) continue;
      const points = line.length * (ms / 1000) * (this.answers(line) ? 2 : 1);
      this.scores.set(who, (this.scores.get(who) ?? 0) + points);
    }
  }
}
