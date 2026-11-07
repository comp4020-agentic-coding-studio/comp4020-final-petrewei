// Every refusal a player can be given reaches the page as the server's English, which the page translates by those
// exact words (public/i18n.js refusal()). A refusal reworded on the server, or a new one, without its translation
// would show in English on the Japanese and Chinese pages and nothing would say so. This drives each desk into its
// refusals and checks that every one comes back with a translation in every language.
import { expect, it } from "vitest";
import { Desk } from "../src/fx.ts";
import { borrow, close, exit, fresh, order, repay } from "../src/book.ts";
import { T } from "../public/i18n.js";

const usd = { EUR: 1.12, GBP: 1.35, AUD: 0.7, USD: 1, CHF: 1 / 0.82, CNY: 1 / 6.67, JPY: 1 / 158 };

function refusals(): string[] {
  const said: string[] = [];
  const keep = (r: unknown) => { if (typeof r === "string") said.push(r); };
  // the round desk
  const d = new Desk(100);
  d.join("a");
  keep(d.order("a", 1, 7));
  keep(d.order("a", 1, 10, 2));
  keep(d.order("a", 1, 10, 1, { sl: 3 }));
  keep(d.order("a", 1, 10, 1, { tp: 3 }));
  keep(d.close("a"));
  keep(d.stop("a", 99));
  keep(d.take("a", 101));
  keep(d.stopAway("a", 3));
  keep(d.takeAway("a", 3));
  keep(d.unpend("a"));
  keep(d.pend("a", { side: 1, at: 100, leverage: 10, share: 1 }));
  keep(d.pend("a", { side: 1, at: 1000, leverage: 10, share: 1 }));
  keep(d.pend("a", { side: 1, at: NaN, leverage: 10, share: 1 }));
  keep(d.repay("a"));
  d.order("a", 1, 10, 1);
  keep(d.order("a", 1, 10, 1));
  keep(d.stop("a", 101));
  keep(d.take("a", 99));
  d.order("a", -1, 10, 1);
  d.order("a", -1, 10, 1);
  keep(d.stop("a", 99));
  keep(d.take("a", 101));
  while (d.borrow("a") === null);
  keep(d.borrow("a"));
  d.account("a").balance = 0;
  keep(d.repay("a"));
  d.account("a").out = true;
  keep(d.order("a", 1, 10, 1));
  keep(d.pend("a", { side: 1, at: 99, leverage: 10, share: 1 }));
  // Live's book
  const a = fresh(0, 0);
  keep(order(a, "AUD/USD", usd, 1, 7, 1, {}, 0));
  keep(order(a, "AUD/USD", usd, 1, 10, 2, {}, 0));
  keep(order(a, "AUD/USD", usd, 1, 10, 1, { sl: 3 }, 0));
  keep(close(a, "AUD/USD", usd, 0));
  keep(exit(a, "AUD/USD", usd, "stop", 1));
  keep(repay(a));
  order(a, "AUD/USD", usd, 1, 10, 1, {}, 0);
  keep(order(a, "EUR/USD", usd, 1, 10, 1, {}, 0));
  keep(exit(a, "AUD/USD", usd, "take", 3));
  while (borrow(a) === null);
  keep(borrow(a));
  return [...new Set(said)];
}

it("translates every refusal a desk gives, in every language", () => {
  const said = refusals();
  expect(said.length, "the desks were driven into their refusals").toBeGreaterThan(15);
  for (const lang of ["en", "ja", "zh"] as const) {
    const missing = said.filter((r) => !(r in T[lang].refusals));
    expect(missing, `${lang}: refusals with no translation`).toEqual([]);
  }
});
