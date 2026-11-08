// The house traders in Live (ADR 0095): each of the comic's seven plays its own habit on a real pair it favours, at the
// price now, so Live has company. A bot keeps a desk of its own, the rounds' desk on one pair, which Live's price for
// that pair marks on every poll; its trades are told in Live's feed. Nothing is saved, and no bot is on Live's board or
// near a player's account: they are the room's noise, not its rivals.
import { BOTS } from "./bots.ts";
import { Desk, type Fill } from "./fx.ts";
import { cross, type Usd } from "./feed.ts";

// Each bot's pair, by its habit: Kurumi and Kizuna chase the yen carry trade, Mochiko and Inago the big majors, Yasuko
// shorts the euro, Mebuki keeps to the franc, Nana to the Australian dollar at home.
const PAIRS: Record<string, string> = {
  "bot:kurumi": "AUD/JPY", "bot:kizuna": "GBP/JPY", "bot:mochiko": "EUR/USD", "bot:inago": "USD/JPY",
  "bot:yasuko": "EUR/GBP", "bot:mebuki": "USD/CHF", "bot:nana": "AUD/USD",
};
// How many recent prices a bot reads, as many as its habits look back.
const SEEN = 40;

export type Say = (text: string, kind: string, key: string, args: Record<string, string | number>) => void;

export class LiveBots {
  private desks = new Map<string, { desk: Desk; pair: string; prices: number[] }>();
  private rnd: () => number;
  constructor(rnd: () => number = Math.random) {
    this.rnd = rnd;
  }

  // One beat: each bot's desk marked at its pair's price now, then each bot does at most one thing, told in the feed.
  step(usd: Usd, say: Say): void {
    for (const b of BOTS) {
      const pair = PAIRS[b.id];
      if (!pair) continue;
      const price = cross(usd, pair);
      let entry = this.desks.get(b.id);
      if (!entry) {
        const desk = new Desk(price);
        desk.join(b.id);
        entry = { desk, pair, prices: [] };
        this.desks.set(b.id, entry);
      }
      entry.prices = [...entry.prices, price].slice(-SEEN);
      const told = (fills: Fill[]) => { for (const f of fills) tell(f, pair, say); };
      told(entry.desk.mark(price));
      // a bot cut out of its market starts again, so Live always has company
      if (entry.desk.account(b.id).out && !entry.desk.account(b.id).pos) entry.desk.reset(b.id);
      const action = b.act(entry.desk, b.id, entry.prices, this.rnd);
      if (action?.kind === "order") {
        const out = entry.desk.order(b.id, action.side, action.leverage, action.share ?? 1, { sl: action.sl, tp: action.tp });
        if (typeof out !== "string") told(out);
      } else if (action?.kind === "close") {
        const out = entry.desk.close(b.id);
        if (typeof out !== "string") told(out);
      }
    }
  }
}

// A bot's fill in Live's words: what it bought or sold, on which pair at what leverage, or what it closed for.
function tell(f: Fill, pair: string, say: Say): void {
  const args = { who: f.who, pair, pnl: Math.round(f.pnl), lev: f.leverage ?? 0 };
  if (f.kind === "open") say(`${f.who} ${f.side === 1 ? "bought" : "sold"} ${pair} at ${f.leverage}×`, f.side === 1 ? "buy" : "sell", f.side === 1 ? "m-bought" : "m-sold", args);
  else if (f.kind === "close" || f.kind === "take" || f.kind === "stop") say(`${f.who} closed ${pair}`, f.pnl >= 0 ? "win" : "loss", "m-closed", args);
  else if (f.kind === "stopout" || f.kind === "zerocut") say(`強制ロスカット! ${f.who} was stopped out on ${pair}`, "bust", "m-stopout", args);
}
