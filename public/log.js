// The operator's live view, for narrating a crit: re-reads /api/log every
// second, which is plenty for a person and keeps it off the game's stream.
const $ = (id) => document.getElementById(id);
const time = new Intl.DateTimeFormat("en-AU", { timeStyle: "medium" });
const yen = (n) => `${n < 0 ? "−" : ""}¥${Math.abs(Math.round(n)).toLocaleString("en-AU")}`;

// One log line in words, so the page can be read aloud without the JSON.
function say(l) {
  switch (l.ev) {
    case "open": return `opened the page (${l.here} here)`;
    case "close": return `closed the page (${l.here} here)`;
    case "add": return `added to a ${l.side} on ${l.pair} at ${l.price}, now ${l.leverage}×`;
    case "stop": return l.at === null ? "removed their stop" : `set a stop at ${l.at}`;
    case "stopout": return `was stopped out on ${l.pair} at ${l.price}: ${yen(l.pnl)}`;
    case "zerocut": return `was wiped out on ${l.pair} at ${l.price}: ${yen(l.pnl)}`;
    case "borrow": return `borrowed from Dad, owing ${yen(l.debt)}`;
    case "pray": return `prayed to the chart (×${l.times})`;
    case "refused": return `tried to ${l.action}; refused: ${l.why}`;
    case "start": return `round began: ${l.pair}${l.simulated ? " (live, simulated)" : ` from ${l.from}${l.event ? `, hiding ${l.event}` : ""}`}`;
    case "end": return `round ended: ${l.ranking.map(([w, n]) => `${w} ${yen(n)}`).join(", ")}`;
    case "rates": return `fetched today's rates (${l.date})`;
    default: return l.ev;
  }
}
// "open" and "close" name both a page and a position; a position's line
// carries a price.
const words = (l) =>
  l.price === undefined ? say(l)
  : l.ev === "open" ? `${l.side === "buy" ? "bought" : "sold"} ${l.pair} at ${l.price}, ${l.leverage}×`
  : l.ev === "close" ? `closed on ${l.pair} at ${l.price}: ${yen(l.pnl)}`
  : l.ev === "stop" ? `stop filled on ${l.pair} at ${l.price}: ${yen(l.pnl)}`
  : say(l);

async function refresh() {
  const { here, round, pair, phase, recent } = await (await fetch(`/api/log${location.search}`)).json();
  $("summary").textContent = `${here} here · round ${round} · ${pair} · ${phase}`;
  $("log").replaceChildren(
    ...recent.map((l) => {
      const li = document.createElement("li");
      const t = document.createElement("time");
      t.dateTime = l.t;
      t.textContent = time.format(new Date(l.t));
      const who = document.createElement("code");
      who.textContent = l.who;
      li.append(t, " ", who, " ");
      if (l.name && !l.who.startsWith("bot:")) li.append(Object.assign(document.createElement("strong"), { textContent: l.name }), " ");
      li.append(words(l));
      return li;
    }),
  );
}
await refresh();
setInterval(refresh, 1000);
