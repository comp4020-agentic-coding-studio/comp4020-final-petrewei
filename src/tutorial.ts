// The Tutorial tab: one player's private market, run lesson by lesson, for
// someone who has never traded. Each lesson explains one idea, asks for
// one action, and accepts only that action, with a hint otherwise. The
// price stands still until the action is taken, then moves along the
// lesson's script, so a profit, a margin call, a stop or a gap happens on
// cue. The same desk and broker rules as the real markets apply.
import { Desk, type Fill, type Side } from "./fx.ts";

export type Move = { kind: "next" } | { kind: "order"; side: Side; leverage: number; stake?: number } | { kind: "close" } | { kind: "stop"; pct: number | null } | { kind: "borrow" };

// `stage`: a press that belongs to one stage of a lesson of several moves; the
// pointer shows it only then (ADR 0057).
export type Step = { target: string; until: string; say: string; stage?: number };
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
  // Null if the move is the one this lesson teaches, else a hint. A lesson
  // of several moves reads `t.stage`, the moves already made in it.
  allow: (m: Move, t: Tutorial) => string | null;
  // Prices to play after the move, as multiples of the price at the time.
  path?: number[] | ((t: Tutorial) => number[]);
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
    text: "Forex (FX) is trading one currency for another. This chart is USD/JPY: the price is how many yen one US dollar costs, so a rising price means a stronger dollar. You have ¥1,000,000 of practice money. Nothing here is real or saved. It takes about five minutes.",
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
    text: "To buy is to bet the price will rise. Leverage is how many times your money you bet with: 1× borrows nothing. Stake is the share of your money you put in.",
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
    text: "The price rose about 1%, and so did your money. Open P&L is what you would make by closing now. A profit is not yours until you close. You started slightly down because of the spread, the small gap between the buying and selling price that the broker keeps.",
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
    text: "To sell, or go short, is the opposite bet: you make money when the price falls. You don't need to own dollars to sell them. The broker lends them to you.",
    task: "Keep Leverage at 1×, then press Sell.",
    plan: [
      { target: "leverage", until: "leverage=1", say: "Keep Leverage at 1×." },
      { target: "sell", until: "press", say: "Now press Sell." },
    ],
    allow: order(-1, 1, false),
    path: [1.002, 0.999, 0.997, 0.998, 0.995, 0.993, 0.994, 0.991, 0.989, 0.99],
    done: holding,
    solve: () => ({ kind: "order", side: -1, leverage: 1 }),
  },
  {
    id: "close-short",
    title: "Closing a Short",
    text: "The price fell, so your short made money: you sold dollars at the higher price and buy them back cheaper. Closing does the buying back.",
    task: "Press Close on your position.",
    plan: [
      { target: "close", until: "press", say: "Press Close to buy them back." },
    ],
    allow: only("close", "Press Close on your position."),
    done: flat,
    solve: () => ({ kind: "close" }),
  },
  {
    id: "leverage",
    title: "Leverage: The Magnifying Glass",
    text: "At 30× leverage your ¥1,000,000 controls ¥30,000,000 of dollars, so a 1% move changes your money by 30%, either way. 30× is the legal limit for retail traders in Australia on major pairs. Offshore brokers offer up to 1000×.",
    task: "Set Leverage to 30× and Stake to 100%, press Buy, then watch Margin Level.",
    plan: [
      { target: "leverage", until: "leverage=30", say: "Slide Leverage to 30×." },
      { target: "stake", until: "stake=1", say: "Set Stake to 100%." },
      { target: "buy", until: "press", say: "Press Buy." },
      { target: "level", until: "look", say: "Margin Level: your money against the broker's deposit." },
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
    text: "A fall of about 2% has cost you around half your money. Margin Level is under 50%: a margin call, the broker's warning. At 20% the broker closes your position for you, at whatever the price is then: a forced loss cut, 強制ロスカット. Cutting a loss means closing a losing trade on purpose, while you still have money left.",
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
    id: "stop-buy",
    title: "A Stop Loss Decides in Advance",
    text: "A Stop Loss closes your position by itself if the price moves against you by a set amount. You decide what you can afford to lose before the trade, not in a panic during it. Your account is back to ¥1,000,000.",
    task: "Set Leverage to 10× and Stake to 100%, then press Buy.",
    plan: [
      { target: "leverage", until: "leverage=10", say: "Slide Leverage to 10×." },
      { target: "stake", until: "stake=1", say: "Set Stake to 100%." },
      { target: "buy", until: "press", say: "Press Buy." },
    ],
    fresh: true,
    allow: order(1, 10, true),
    done: holding,
    solve: () => ({ kind: "order", side: 1, leverage: 10, stake: 1 }),
  },
  {
    id: "stop-set",
    title: "Setting the Stop",
    text: "A Stop Loss 1% below the price sells if the price falls that far. At 10× leverage that keeps your loss to about 10% of your money.",
    task: "Drag the Stop Loss thumb to 1%, beside the middle line.",
    plan: [
      { target: "stop", until: "look", say: "Your position's Stop Loss and Take Profit." },
      { target: "stopthumb", until: "press", say: "Drag the red thumb next to the middle line: 1%." },
    ],
    allow: (m) => {
      if (m.kind !== "stop" || m.pct === null) return "Drag the Stop Loss thumb to 1%, next to the middle line.";
      // 1% is the first rung of the thumb; just past it still teaches the idea
      if (m.pct < 1 || m.pct > 1.5) return `This lesson wants a Stop Loss at 1%, not ${m.pct}%. Drag the thumb as close to the middle line as it goes.`;
      return null;
    },
    path: [0.998, 0.996, 0.993, 0.991, 0.988, 0.985, 0.983],
    done: flat,
    solve: () => ({ kind: "stop", pct: 1 }),
  },
  {
    id: "highest",
    title: "The Highest Leverage: 1000×",
    text: "Some offshore brokers offer 1000×, the top of the menu. Your ¥1,000,000 would control ¥1,000,000,000, so a move of a tenth of a percent is your whole account. Watch the price rise a little and fall a little, as in any ordinary minute.\nThe spread alone takes a fifth of your money the moment you buy, and the financing fee grows with the square of the leverage. A fall of 0.1% brings a margin call, then the forced loss cut. Now you may \"borrow\" from Dad's savings. In the comic that means taking the money from the dresser at home, without asking. Do it, and trade 1000× again.\nThis time the price gaps, as the franc did on 15 January 2015, and a gap jumps every stop and every loss cut: you are bankrupt, and Dad finds the money gone. Nobody can call moves this small, so the highest leverage is a coin flip the spread tilts against you. If you ever trade for real, keep leverage low, risk little, and use a Stop Loss.",
    task: "Set Leverage to 1000× and Stake to 100%, press Buy, then \"borrow\" and press Buy again.",
    plan: [
      { target: "leverage", until: "leverage=1000", say: "Slide Leverage to 1000×, the highest." },
      { target: "stake", until: "stake=1", say: "Set Stake to 100%." },
      { target: "buy", until: "press", say: "Press Buy, then watch.", stage: 0 },
      { target: "borrow", until: "press", say: "\"Borrow\" from Dad's savings.", stage: 1 },
      { target: "buy", until: "press", say: "Press Buy again.", stage: 2 },
    ],
    fresh: true,
    allow: (m, t) => (t.stage === 1 ? (m.kind === "borrow" ? null : "\"Borrow\" from Dad's savings in the pop-up first.") : order(1, 1000, true)(m)),
    // the first Buy: small moves, then the fall; the second: a gap through everything
    path: (t) => (t.stage === 0 ? [1.0001, 1.0002, 1.0003, 1.0002, 1.0001, 0.9999, 0.9997, 0.9995, 0.9993, 0.999, 0.9985] : t.stage === 1 ? [] : [1.001, 0.85, 0.86]),
    // Dad finds out once the second trade has been wiped out
    settle: (t) => {
      if (t.stage >= 3 && t.desk.account(ME).caught === 0) t.describe(t.desk.discover(ME));
    },
    done: (t) => t.desk.account(ME).caught > 0,
    solve: (t) => (t.stage === 1 ? { kind: "borrow" } : { kind: "order", side: 1, leverage: 1000, stake: 1 }),
  },
];

type Snapshot = { desk: Desk; prices: number[]; feed: Tutorial["feed"]; stage: number };

export class Tutorial {
  desk!: Desk;
  index = 0;
  nexted = false;
  // The moves made so far in a lesson that takes several (ADR 0057).
  stage = 0;
  // How a lesson began, so it can be started again without the others.
  private begun!: Snapshot;
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
    this.queue = [];
    this.prices = [START_PRICE];
    this.feed = [];
    this.stage = 0;
    this.fresh();
    this.snapshot();
  }

  private snapshot(): void {
    this.begun = { desk: this.desk.clone(), prices: [...this.prices], feed: structuredClone(this.feed), stage: 0 };
  }

  // Start the current lesson again, from the money and price it began with.
  restartLesson(): void {
    this.runs++;
    this.queue = [];
    this.nexted = false;
    this.stage = 0;
    this.desk = this.begun.desk.clone();
    this.prices = [...this.begun.prices];
    this.feed = structuredClone(this.begun.feed);
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
      const path = typeof lesson.path === "function" ? lesson.path(this) : (lesson.path ?? []);
      this.queue = path.map((x) => base * x);
      this.stage++;
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
    this.stage = 0;
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

