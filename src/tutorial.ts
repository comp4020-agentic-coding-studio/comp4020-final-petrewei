// The Tutorial tab: one player's private market, run lesson by lesson, for
// someone who has never traded. Each lesson explains one idea, asks for
// one action, and accepts only that action, with a hint otherwise. The
// price stands still until the action is taken, then moves along the
// lesson's script, so a profit, a margin call, a stop or a gap happens on
// cue. The same desk and broker rules as the real markets apply.
import { Desk, type Fill, type Side } from "./fx.ts";

export type Move = { kind: "next" } | { kind: "order"; side: Side; leverage: number; stake?: number } | { kind: "close" } | { kind: "stop"; pct: number | null } | { kind: "borrow" };

// `move`: a press that is the nth move of a lesson of several (0 by default);
// the pointer shows it only when that many moves have been made (ADR 0059).
export type Step = { target: string; until: string; say: string; move?: number };
type Lesson = {
  id: string;
  title: string;
  text: string;
  task: string;
  // The exact elements the lesson points at, one step at a time (ADR 0052):
  // look at something, set a slider to a value the page checks, or press the
  // control that takes the lesson's action, each with the words shown for it.
  plan: Step[];
  // Whether the lesson starts from a fresh ¥1,000,000.
  fresh?: boolean;
  // Null if the move is the one this lesson teaches, else a hint.
  allow: (m: Move, t: Tutorial) => string | null;
  // Prices to play after the move, as multiples of the price at the time.
  // Prices to play after a move: the same for every move, or by how many were made.
  path?: number[] | ((moves: number) => number[]);
  after?: (t: Tutorial) => void;
  // Run whenever the price stands still again, before `done` is asked.
  settle?: (t: Tutorial) => void;
  done: (t: Tutorial) => boolean;
  // The move that passes the lesson, for tests.
  solve: (t: Tutorial) => Move;
};

const ME = "me";
const START_PRICE = 150;
const stake = (m: Move): number => (m.kind === "order" ? (m.stake ?? 1) : 0);
const order = (side: Side, leverage: number, full: boolean) => (m: Move): string | null => {
  const word = side === 1 ? "Buy" : "Sell";
  if (m.kind !== "order" || m.side !== side || m.leverage !== leverage) return `This lesson wants a ${word} at ${leverage}×. Set Leverage to ${leverage}× first.`;
  if (full && stake(m) !== 1) return "Set Stake to 100% for this lesson.";
  return null;
};
const only = (kind: Move["kind"], hint: string) => (m: Move): string | null => (m.kind === kind ? null : hint);
const flat = (t: Tutorial): boolean => !t.desk.account(ME).pos;
const holding = (t: Tutorial): boolean => !!t.desk.account(ME).pos;

export const LESSONS: Lesson[] = [
  {
    id: "welcome",
    title: "Welcome to the Trading Floor",
    text: "Forex is trading one currency for another. This chart is USD/JPY: how many yen one dollar costs. You have ¥1,000,000 of practice money, and nothing here is real.",
    task: "Look at the price and your Net Worth. A click moves on.",
    plan: [
      { target: "chart", until: "look", say: "The price of one dollar, in yen." },
      { target: "equity", until: "look", say: "Your practice money." },
    ],
    allow: only("next", "Click anywhere to begin."),
    done: (t) => t.nexted,
    solve: () => ({ kind: "next" }),
  },
  {
    id: "buy",
    title: "Buy: Betting the Price Rises",
    text: "To buy is to bet the price will rise. Leverage multiplies your bet: 1× borrows nothing. Stake is the share of your money you put in.",
    task: "Slide Leverage to 1×, then press Buy.",
    plan: [
      { target: "leverage", until: "leverage=1", say: "Slide Leverage to 1×." },
      { target: "buy", until: "press", say: "Now press Buy." },
    ],
    fresh: true,
    allow: order(1, 1, false),
    path: [0.998, 1.001, 1.003, 1.002, 1.005, 1.007, 1.006, 1.009, 1.011, 1.01],
    done: holding,
    solve: () => ({ kind: "order", side: 1, leverage: 1 }),
  },
  {
    id: "take-profit",
    title: "Taking Profit",
    text: "The price rose about 1%, and so did your money. A profit is not yours until you close. You started slightly down: that is the spread, the broker's cut.",
    task: "Press Close to bank the profit.",
    plan: [
      { target: "pnl", until: "look", say: "Open P&L: your profit so far." },
      { target: "close", until: "press", say: "Press Close to bank it." },
    ],
    allow: only("close", "Press Close on your position to bank the profit."),
    done: flat,
    solve: () => ({ kind: "close" }),
  },
  {
    id: "sell",
    title: "Sell: Betting the Price Falls",
    text: "To sell, or go short, bets on a fall: you win when the price drops. You don't need to own dollars, the broker lends them. Closing buys them back.",
    task: "Keep Leverage at 1×, press Sell, then press Close.",
    plan: [
      { target: "leverage", until: "leverage=1", say: "Keep Leverage at 1×." },
      { target: "sell", until: "press", say: "Now press Sell." },
      { target: "close", until: "press", say: "Press Close to buy them back.", move: 1 },
    ],
    allow: (m, t) => (holding(t) ? only("close", "Press Close on your position.")(m) : order(-1, 1, false)(m)),
    path: [1.002, 0.999, 0.997, 0.998, 0.995, 0.993, 0.994, 0.991, 0.989, 0.99],
    done: (t) => t.moves > 1 && flat(t),
    solve: (t) => (holding(t) ? { kind: "close" } : { kind: "order", side: -1, leverage: 1 }),
  },
  {
    id: "leverage",
    title: "Leverage: The Magnifying Glass",
    text: "At 30× your ¥1,000,000 controls ¥30,000,000, so a 1% move changes your money by 30%, either way. 30× is Australia's legal cap for retail traders.",
    task: "Set Leverage to 30× and Stake to 100%, then press Buy.",
    plan: [
      { target: "leverage", until: "leverage=30", say: "Slide Leverage to 30×." },
      { target: "stake", until: "stake=1", say: "Set Stake to 100%." },
      { target: "buy", until: "press", say: "Press Buy." },
    ],
    fresh: true,
    allow: order(1, 30, true),
    path: [1.002, 1.004, 1.006, 1.003, 0.999, 0.994, 0.99, 0.985, 0.981, 0.978],
    done: (t) => !!t.desk.account(ME).pos?.called,
    solve: () => ({ kind: "order", side: 1, leverage: 30, stake: 1 }),
  },
  {
    id: "cut-loss",
    title: "Margin Call: Cut the Loss",
    text: "A 2% fall cost about half your money: Margin Level is under 50%, a margin call. At 20% the broker cuts you out, 強制ロスカット. Cut a loss yourself while you can.",
    task: "Press Close to cut your loss.",
    plan: [
      { target: "level", until: "look", say: "Margin Level is under 50%: a margin call." },
      { target: "close", until: "press", say: "Press Close to cut the loss." },
    ],
    allow: only("close", "Press Close on your position to cut your loss."),
    done: flat,
    solve: () => ({ kind: "close" }),
  },
  {
    id: "stop",
    title: "Stop Loss: Decide in Advance",
    text: "A Stop Loss closes the position if the price moves against you by a set amount. Decide what you can afford to lose before the trade. At 10×, a stop 1% away keeps the loss near 10%.",
    task: "Set Leverage to 10× and Stake to 100%, press Buy, then drag the Stop Loss thumb to 1%, beside the middle line.",
    plan: [
      { target: "leverage", until: "leverage=10", say: "Slide Leverage to 10×." },
      { target: "stake", until: "stake=1", say: "Set Stake to 100%." },
      { target: "buy", until: "press", say: "Press Buy." },
      { target: "stop", until: "look", say: "Your position's Stop Loss and Take Profit." },
      { target: "stopthumb", until: "press", say: "Drag the red thumb next to the middle line: 1%.", move: 1 },
    ],
    fresh: true,
    allow: (m, t) => {
      if (!holding(t)) return order(1, 10, true)(m);
      if (m.kind !== "stop" || m.pct === null) return "Drag the Stop Loss thumb to 1%, next to the middle line.";
      // 1% is the first rung of the thumb, the one nearest the middle line
      if (m.pct !== 1) return `This lesson wants a Stop Loss at 1%, not ${m.pct}%. Drag the thumb as close to the middle line as it goes.`;
      return null;
    },
    // the buy moves nothing; the stop is hit on the way down
    path: (moves) => (moves > 1 ? [0.998, 0.996, 0.993, 0.991, 0.988, 0.985, 0.983] : []),
    done: (t) => t.moves > 1 && flat(t),
    solve: (t) => (holding(t) ? { kind: "stop", pct: 1 } : { kind: "order", side: 1, leverage: 10, stake: 1 }),
  },
  {
    id: "highest",
    title: "The Highest Leverage: 1000×",
    text: "Offshore brokers offer 1000×: your ¥1,000,000 controls ¥1,000,000,000, so a 0.1% move is your whole account. The spread alone costs a fifth the moment you buy.",
    task: "Set Leverage to 1000× and Stake to 100%, then press Buy.",
    plan: [
      { target: "leverage", until: "leverage=1000", say: "Slide Leverage to 1000×, the highest." },
      { target: "stake", until: "stake=1", say: "Set Stake to 100%." },
      { target: "buy", until: "press", say: "Press Buy and watch." },
    ],
    fresh: true,
    allow: order(1, 1000, true),
    // small moves, then a fall of 0.15%: a margin call, then the forced cut
    path: [1.0001, 1.0002, 1.0003, 1.0002, 1.0001, 0.9999, 0.9997, 0.9995, 0.9993, 0.999, 0.9985],
    done: (t) => t.desk.account(ME).out,
    solve: () => ({ kind: "order", side: 1, leverage: 1000, stake: 1 }),
  },
  {
    id: "dad",
    title: "Dad's Savings",
    text: "Margin call at 50%, forced loss cut at 20%: your round is over. Now you may \"borrow\" from Dad's savings. In the comic that means taking it from the dresser while he is out.",
    task: "\"Borrow\" from Dad's savings in the pop-up.",
    plan: [
      { target: "level", until: "look", say: "Margin Level hit 20%: the broker cut you." },
      { target: "borrow", until: "press", say: "\"Borrow\" from Dad's savings." },
    ],
    allow: only("borrow", "\"Borrow\" from Dad's savings in the pop-up first."),
    done: (t) => t.desk.account(ME).debt > 0,
    solve: () => ({ kind: "borrow" }),
  },
  {
    id: "gap",
    title: "A Gap and a Wipe-Out",
    text: "Same setting, buy again. The price gaps through every stop and loss cut, as the franc did on 15 January 2015. You are wiped out, and Dad finds the money gone. Keep leverage low.",
    task: "Press Buy again. Leverage and Stake stay as they are.",
    plan: [
      { target: "buy", until: "press", say: "Press Buy again, same setting." },
      { target: "chart", until: "look", say: "The price gapped past every stop." },
      { target: "equity", until: "look", say: "Bankrupt, and Dad found out." },
    ],
    allow: (m, t) => (t.desk.account(ME).caught ? only("next", "Click anywhere to finish.")(m) : order(1, 1000, true)(m)),
    path: [1.001, 0.85, 0.86],
    // Dad finds out once the trade has been wiped out
    settle: (t) => {
      if (t.desk.account(ME).out && t.desk.account(ME).debt > 0 && t.desk.account(ME).caught === 0) t.describe(t.desk.discover(ME));
    },
    done: (t) => t.desk.account(ME).caught > 0 && t.nexted,
    solve: (t) => (t.desk.account(ME).caught ? { kind: "next" } : { kind: "order", side: 1, leverage: 1000, stake: 1 }),
  },
];

type Snapshot = { desk: Desk; prices: number[]; feed: Tutorial["feed"] };

export class Tutorial {
  desk!: Desk;
  index = 0;
  nexted = false;
  // The moves made so far in the current lesson, for a lesson of several.
  moves = 0;
  // How each lesson began, by number, so one can be started again, or gone
  // back to, without the others (ADR 0059).
  private begins: Snapshot[] = [];
  prices: number[] = [];
  feed: { text: string; kind: string; key: string; args: Record<string, string | number> }[] = [];
  private queue: number[] = [];
  // Bumped on every restart, so a page knows to redraw its chart.
  runs = 0;

  constructor() {
    this.restart();
  }

  restart(): void {
    this.runs++;
    this.index = 0;
    this.nexted = false;
    this.moves = 0;
    this.queue = [];
    this.prices = [START_PRICE];
    this.feed = [];
    this.begins = [];
    this.fresh();
    this.snapshot();
  }

  private snapshot(): void {
    this.begins[this.index] = { desk: this.desk.clone(), prices: [...this.prices], feed: structuredClone(this.feed) };
    this.begins.length = this.index + 1;
  }

  private restore(at: number): void {
    const begun = this.begins[at];
    this.runs++;
    this.index = at;
    this.queue = [];
    this.nexted = false;
    this.moves = 0;
    this.desk = begun.desk.clone();
    this.prices = [...begun.prices];
    this.feed = structuredClone(begun.feed);
  }

  // Start the current lesson again, from the money and price it began with. At
  // the end it is the last lesson that starts again.
  restartLesson(): void {
    this.restore(Math.min(this.index, LESSONS.length - 1));
  }

  // Go back to the start of the lesson before this one; from the first lesson,
  // to its own start.
  back(): void {
    this.restore(Math.max(0, Math.min(this.index, LESSONS.length) - 1));
  }

  // Pass the current lesson at once, by making the moves it teaches, and
  // begin the next (the fast-forward button). Every lesson's own moves, as
  // `solve` gives them, are the ones the lesson accepts.
  skip(): string | null {
    if (this.finished()) return "The tutorial is finished. Choose a tab above, or start it again.";
    const at = this.index;
    for (let guard = 0; this.index === at && guard < 12; guard++) {
      const failed = this.act(this.lesson().solve(this));
      if (failed) return failed;
      while (this.moving()) this.step();
    }
    return this.index === at ? "That lesson would not finish." : null;
  }

  lesson(): Lesson {
    return LESSONS[Math.min(this.index, LESSONS.length - 1)];
  }

  finished(): boolean {
    return this.index >= LESSONS.length;
  }

  price(): number {
    return this.desk.price;
  }

  moving(): boolean {
    return this.queue.length > 0;
  }

  act(m: Move): string | null {
    if (this.finished()) return "The tutorial is finished. Choose a tab above, or start it again.";
    if (this.moving()) return "Wait for the price to finish moving.";
    const lesson = this.lesson();
    const hint = lesson.allow(m, this);
    if (hint) return hint;
    if (m.kind === "next") this.nexted = true;
    else {
      const out =
        m.kind === "order" ? this.desk.order(ME, m.side, m.leverage, m.stake)
        : m.kind === "close" ? this.desk.close(ME)
        : m.kind === "stop" ? this.desk.stopAway(ME, m.pct)
        : this.desk.borrow(ME);
      if (typeof out === "string") return out;
      if (Array.isArray(out)) this.describe(out);
      lesson.after?.(this);
      const base = this.desk.price;
      this.moves++;
      const path = typeof lesson.path === "function" ? lesson.path(this.moves) : (lesson.path ?? []);
      this.queue = path.map((x) => base * x);
    }
    if (!this.moving()) this.advance();
    return null;
  }

  // One tick of the lesson's script, if it has one playing.
  step(): Fill[] {
    const price = this.queue.shift();
    if (price === undefined) return [];
    const events = this.desk.mark(price);
    this.prices.push(price);
    this.prices.splice(0, this.prices.length - 240);
    this.describe(events);
    if (!this.moving()) this.advance();
    return events;
  }

  private advance(): void {
    this.lesson().settle?.(this);
    if (!this.lesson().done(this)) return;
    this.index++;
    this.nexted = false;
    this.moves = 0;
    if (!this.finished() && this.lesson().fresh) this.fresh();
    if (!this.finished()) this.snapshot();
  }

  // A fresh ¥1,000,000 at the current price.
  private fresh(): void {
    this.desk = new Desk(this.prices.at(-1) ?? START_PRICE);
    this.desk.join(ME);
  }

  // What just happened, in plain words for a beginner.
  describe(events: Fill[]): void {
    const yen = (n: number): string => `${n < 0 ? "−" : "+"}¥${Math.abs(Math.round(n)).toLocaleString("en-AU")}`;
    for (const e of events) {
      const args = { pnl: Math.round(e.pnl), lev: e.leverage ?? 0, price: e.price.toFixed(3) };
      const say = (text: string, kind: string, key: string): void => {
        this.feed.unshift({ text, kind, key, args });
        this.feed.splice(10);
      };
      if (e.kind === "open") say(`You ${e.side === 1 ? "bought" : "sold"} at ${e.leverage}×.`, "trade", e.side === 1 ? "you-bought" : "you-sold");
      else if (e.kind === "close") say(`You closed: ${yen(e.pnl)}.`, e.pnl >= 0 ? "win" : "loss", "you-closed");
      else if (e.kind === "stop") say(`Your stop filled at ${e.price.toFixed(3)}: ${yen(e.pnl)}.`, "loss", "you-stopped");
      else if (e.kind === "call") say("MARGIN CALL: your margin level fell below 50%.", "call", "you-call");
      else if (e.kind === "stopout") say(`強制ロスカット: the broker closed you at 20%: ${yen(e.pnl)}. You are out until you borrow.`, "bust", "you-stopout");
      else if (e.kind === "zerocut") say(`Wiped out at ${e.price.toFixed(3)}, far past your stop: ${yen(e.pnl)}.`, "bust", "you-zerocut");
      else if (e.kind === "caught") say("Dad found the money gone from the dresser. You are grounded.", "bust", "you-caught");
    }
  }
}

