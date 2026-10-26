// The Tutorial tab: one player's private market, run lesson by lesson, for
// someone who has never traded. Each lesson explains one idea, asks for
// one action, and accepts only that action, with a hint otherwise. The
// price stands still until the action is taken, then moves along the
// lesson's script, so a profit, a margin call, a stop or a gap happens on
// cue. The same desk and broker rules as the real markets apply.
import { Desk, type Fill, type Side } from "./fx.ts";

export type Move = { kind: "next" } | { kind: "order"; side: Side; leverage: number; stake?: number } | { kind: "close" } | { kind: "stop"; pct: number | null } | { kind: "borrow" };

type Lesson = {
  id: string;
  title: string;
  text: string;
  task: string;
  // The page elements the lesson is about, highlighted on the page.
  focus: string[];
  // Whether the lesson starts from a fresh ¥1,000,000.
  fresh?: boolean;
  // Null if the move is the one this lesson teaches, else a hint.
  allow: (m: Move) => string | null;
  // Prices to play after the move, as multiples of the price at the time.
  path?: number[];
  after?: (t: Tutorial) => void;
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
    title: "Welcome to the trading floor",
    text: "Forex (FX) is trading one currency for another. This chart is USD/JPY: the price is how many yen one US dollar costs, so when it rises the dollar has grown stronger. You have ¥1,000,000 of practice money. Nothing here is real or saved, and nobody else is in this room. It takes about five minutes.",
    task: "Press Next to begin.",
    focus: ["chart", "equity"],
    allow: only("next", "Press Next to begin."),
    done: (t) => t.nexted,
    solve: () => ({ kind: "next" }),
  },
  {
    id: "buy",
    title: "Buy: betting the price rises",
    text: "To buy is to bet that the price will go up. Leverage is how many times your money you bet with; 1× means you borrow nothing. Stake is the share of your money you put in.",
    task: "Set Leverage to 1×, then press Buy, and watch the chart.",
    focus: ["leverage", "buy"],
    fresh: true,
    allow: order(1, 1, false),
    path: [0.998, 1.001, 1.003, 1.002, 1.005, 1.007, 1.006, 1.009, 1.011, 1.01],
    done: holding,
    solve: () => ({ kind: "order", side: 1, leverage: 1 }),
  },
  {
    id: "take-profit",
    title: "Taking profit",
    text: "The price rose about 1%, and so did your money. Open P&L is what you would make if you closed now: a profit is not yours until you close. You started slightly down because of the spread, the small gap between the buying and selling price that the broker keeps.",
    task: "Press Close on your position to bank the profit.",
    focus: ["pnl", "close"],
    allow: only("close", "Press Close on your position to bank the profit."),
    done: flat,
    solve: () => ({ kind: "close" }),
  },
  {
    id: "sell",
    title: "Sell: betting the price falls",
    text: "To sell, or go short, is the opposite bet: you make money when the price falls. You don't need to own any dollars to sell them; the broker lends them to you.",
    task: "Keep Leverage at 1× and press Sell.",
    focus: ["sell"],
    allow: order(-1, 1, false),
    path: [1.002, 0.999, 0.997, 0.998, 0.995, 0.993, 0.994, 0.991, 0.989, 0.99],
    done: holding,
    solve: () => ({ kind: "order", side: -1, leverage: 1 }),
  },
  {
    id: "close-short",
    title: "Closing a short",
    text: "The price fell, so your short made money: you sold dollars at the higher price and buy them back cheaper. Closing does the buying back.",
    task: "Press Close on your position.",
    focus: ["close"],
    allow: only("close", "Press Close on your position."),
    done: flat,
    solve: () => ({ kind: "close" }),
  },
  {
    id: "leverage",
    title: "Leverage: the magnifying glass",
    text: "At 25× leverage your ¥1,000,000 controls ¥25,000,000 of dollars, so a 1% move changes your money by 25%, either way. 25× is the legal limit for retail traders in Japan; offshore brokers offer up to 1000×. Watch the Margin level bar: it is your money as a share of the deposit the broker holds against the bet.",
    task: "Set Leverage to 25× and Stake to 100%, press Buy, then watch the margin level.",
    focus: ["leverage", "stake", "buy", "level"],
    fresh: true,
    allow: order(1, 25, true),
    path: [1.002, 1.004, 1.006, 1.003, 0.999, 0.994, 0.99, 0.985, 0.981, 0.978],
    done: (t) => !!t.desk.account(ME).pos?.called,
    solve: () => ({ kind: "order", side: 1, leverage: 25, stake: 1 }),
  },
  {
    id: "cut-loss",
    title: "Margin call: cut the loss",
    text: "A fall of about 2% has cost you around half your money, and your margin level is under 50%: a margin call, the broker's warning. If it reaches 20%, the broker closes your position for you, at whatever the price is then. That is a forced loss cut, 強制ロスカット. Hoping the price comes back is how accounts are lost; cutting a loss means closing a losing trade on purpose while you still have money left.",
    task: "Press Close on your position to cut your loss.",
    focus: ["close", "level"],
    allow: only("close", "Press Close on your position to cut your loss."),
    done: flat,
    solve: () => ({ kind: "close" }),
  },
  {
    id: "stop-buy",
    title: "A stop-loss decides in advance",
    text: "A stop-loss closes your position by itself if the price moves against you by a set amount. You decide how much you can afford to lose before the trade, not in a panic during it. Your account is back to ¥1,000,000.",
    task: "Set Leverage to 10× and Stake to 100%, then press Buy.",
    focus: ["leverage", "stake", "buy"],
    fresh: true,
    allow: order(1, 10, true),
    done: holding,
    solve: () => ({ kind: "order", side: 1, leverage: 10, stake: 1 }),
  },
  {
    id: "stop-set",
    title: "Setting the stop",
    text: "A stop 1% below the price will sell if the price falls that far. At 10× leverage that keeps your loss to about 10% of your money.",
    task: "Press Add 1% stop on your position, then watch.",
    focus: ["stop"],
    allow: (m) => (m.kind === "stop" && m.pct !== null ? null : "Press Add 1% stop on your position."),
    path: [0.998, 0.996, 0.993, 0.991, 0.988, 0.985, 0.983],
    done: flat,
    solve: () => ({ kind: "stop", pct: 1 }),
  },
  {
    id: "gap",
    title: "When a stop can't save you",
    text: "Your stop filled a little past −1%: a stop closes at the next price there is, not exactly at its level. Usually that is close. On 15 January 2015 the Swiss central bank dropped its cap on the franc, and the price jumped about 15% in minutes with almost no prices in between. Stops filled far past their levels, and many traders lost more than they had.",
    task: "Set Leverage to 25× and Stake to 100%, then press Buy. A stop 1% below is set for you.",
    focus: ["leverage", "stake", "buy"],
    fresh: true,
    allow: order(1, 25, true),
    after: (t) => t.desk.stopAway(ME, 1),
    path: [1.001, 0.85, 0.86, 0.87],
    done: (t) => t.desk.account(ME).out,
    solve: () => ({ kind: "order", side: 1, leverage: 25, stake: 1 }),
  },
  {
    id: "dad",
    title: "Dad's savings",
    text: "Wiped out: the price jumped straight past your stop, and your loss was several times your money. This broker has a zero-cut, so you owe nothing and your account is simply ¥0; brokers in Japan can bill you for the rest. In the game you may now borrow from Dad's savings, twice a round, and the debt counts against your result. Borrowing to win back what you lost is the trap the comic is about.",
    task: "Press Next to walk away, or Borrow to see how it works.",
    focus: ["borrow"],
    allow: (m) => (m.kind === "next" || m.kind === "borrow" ? null : "Press Next to walk away, or Borrow."),
    done: (t) => t.nexted || t.desk.account(ME).debt > 0,
    solve: () => ({ kind: "next" }),
  },
  {
    id: "ready",
    title: "You're ready",
    text: "Buy if you think the price will rise, sell if you think it will fall. Leverage multiplies both wins and losses. Watch your margin level, cut losses early, use a stop, and remember gaps. In real life most retail traders using leverage lose money; here it is free. Try Replay for real crashes with the date hidden, or Scenario for a scripted market from today's rate.",
    task: "Press Next to finish, then choose a tab above.",
    focus: [],
    allow: only("next", "Press Next to finish."),
    done: (t) => t.nexted,
    solve: () => ({ kind: "next" }),
  },
];

export class Tutorial {
  desk!: Desk;
  index = 0;
  nexted = false;
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
    this.fresh();
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
    const hint = lesson.allow(m);
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
      this.queue = (lesson.path ?? []).map((x) => base * x);
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
    if (!this.lesson().done(this)) return;
    this.index++;
    this.nexted = false;
    if (!this.finished() && this.lesson().fresh) this.fresh();
  }

  // A fresh ¥1,000,000 at the current price.
  private fresh(): void {
    this.desk = new Desk(this.prices.at(-1) ?? START_PRICE);
    this.desk.join(ME);
  }

  // What just happened, in plain words for a beginner.
  private describe(events: Fill[]): void {
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
    }
  }
}

