// The operator's live view, for narrating a crit: re-reads /api/log every
// second, which is plenty for a person and keeps it off the game's stream.
import { yen } from "/format.js";

const $ = (id) => document.getElementById(id);
const time = new Intl.DateTimeFormat("en-AU", { timeStyle: "medium" });

// One log line in words, so the page can be read aloud without the JSON.
function say(l) {
  switch (l.ev) {
    case "join": return `opened the ${l.mode ?? "replay"} tab (${l.here} here)`;
    case "tab": return `switched to the ${l.mode} tab`;
    case "leave": return `closed the page (${l.here} here)`;
    // Lines saved before page visits were renamed join/leave carry no price.
    case "open": return l.price === undefined ? "opened the page" : `${l.side === "buy" ? "bought" : "sold"} ${l.pair} at ${l.price}, ${l.leverage}×`;
    case "add": return `added to a ${l.side} on ${l.pair} at ${l.price}, now ${l.leverage}×`;
    case "close": return l.price === undefined ? "closed the page" : `closed on ${l.pair} at ${l.price}: ${yen(l.pnl)}`;
    case "stop": return `stop filled on ${l.pair} at ${l.price}: ${yen(l.pnl)}`;
    case "stop-set": return l.at === null ? "removed their stop" : `set a stop at ${l.at}`;
    case "call": return `got a margin call on ${l.pair} at ${l.price}`;
    case "stopout": return `was stopped out on ${l.pair} at ${l.price}: ${yen(l.pnl)}`;
    case "zerocut": return `was wiped out on ${l.pair} at ${l.price}: ${yen(l.pnl)}`;
    case "borrow": return `borrowed from Dad, owing ${yen(l.debt)}`;
    case "pray": return `prayed to the chart (×${l.times})`;
    case "refused": return `tried to ${l.action}; refused: ${l.why}`;
    case "start": return `${l.mode ?? ""} round began: ${l.pair}${l.simulated ? " (simulation)" : ` from ${l.from}${l.event ? `, hiding ${l.event}` : ""}`}`;
    case "end": return `${l.mode ?? ""} round ended: ${l.ranking.map(([w, n]) => `${w} ${yen(n)}`).join(", ")}`;
    case "rates": return `fetched today's rates (${l.date})`;
    default: return l.ev;
  }
}

async function refresh() {
  const { here, rooms, recent } = await (await fetch(`/api/log${location.search}`)).json();
  $("summary").textContent = `${here} here · ${rooms.map((r) => `${r.mode} round ${r.round} ${r.pair} ${r.phase}`).join(" · ")}`;
  $("log").replaceChildren(
    ...recent.map((l) => {
      const li = document.createElement("li");
      const t = document.createElement("time");
      t.dateTime = l.t;
      t.textContent = time.format(new Date(l.t));
      const who = document.createElement("code");
      who.textContent = l.who;
      li.append(t, " ", who, " ");
      if (l.name) li.append(Object.assign(document.createElement("strong"), { textContent: l.name }), " ");
      li.append(say(l));
      return li;
    }),
  );
}
await refresh();
setInterval(refresh, 1000);
