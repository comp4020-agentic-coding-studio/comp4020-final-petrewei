# ADR 0094: Every Pair, Either Way Round

Status: accepted, 8 November 2026. Widens the pairs of [ADR 0085](0085-a-finer-clock-a-golden-credit-card-and-a-real-calendar.md) and [ADR 0087](0087-marathon-on-real-prices-and-accounts-in-australian-dollars.md). Peter asked for every pair.

## 1 Context

Random and Live offered the twenty-one pairs of their seven currencies, each written the one way a broker writes it, the euro first and the yen last. The menus took that shape: the euro had six currencies to pair with and the yuan one, and the yen could never come first, so an Australian could not put the Australian dollar before the euro. The other twenty-one looked missing though they were the same markets the other way round.

## 2 Decision

**Any currency first.** A player may choose any of the forty-two ordered pairs. A reversed pair, AUD/EUR, is a market of its own, priced as its quote's rate over its base's, the inverse of the standard pair's; the price code already worked out any pair so, and buying it is the same bet as selling the standard pair. A round drawn at random, with no pair chosen, is still one of the twenty-one, and a rewind replays the real data, which is kept that way.

**A pip by the quote currency.** A spread is read in pips: a hundredth when the quote is the yen, otherwise a ten-thousandth, as FX writes them, so every standard pair keeps its pip. A pair with the yen first is priced around a hundredth, so its pip is a hundredth of that and its spread reads in a few pips. The server sends the pip, in place of a guess on the page from the pair's name.

## 3 Consequences

Every currency has the other six to pair with in both menus. Live's saved accounts may hold any of the forty-two.
