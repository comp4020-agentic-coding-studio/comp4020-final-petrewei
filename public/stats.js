// The live view for crit 10: re-reads /api/stats every second, which is
// plenty for a person watching and keeps this page off the fridge's stream.
const $ = (id) => document.getElementById(id);
const time = new Intl.DateTimeFormat("en-AU", { timeStyle: "medium" });

// One log line in words, so the page can be narrated without the JSON.
function say(l) {
  switch (l.ev) {
    case "join": return `opened the fridge (${l.here} here)`;
    case "leave": return `left (${l.here} here)`;
    case "grab": return `picked up “${l.word}”`;
    case "release": return `put down “${l.word}” where it was`;
    case "move": return l.from ? `took “${l.word}” from ${l.from}` : `moved “${l.word}”`;
    case "refused": return `reached for “${l.word}”, but ${l.holder} is holding it`;
    case "rejected": return `sent a move the server refused`;
    case "lapse": return `held “${l.word}” too long; it was freed`;
    case "drop": return `closed the page holding “${l.word}”; it was freed`;
    case "seen": return `came back to find ${l.words.length} word(s) taken`;
    case "poem": return `a line broke after ${l.stood}s and went to the archive: “${l.text}”`;
    default: return l.ev;
  }
}

async function refresh() {
  const { here, holding, recent } = await (await fetch("/api/stats")).json();
  const since = Date.now() - 5 * 60_000;
  const last5 = recent.filter((l) => new Date(l.t).getTime() > since);
  $("here").textContent = here;
  $("holding").textContent = holding;
  $("moves").textContent = last5.filter((l) => l.ev === "move").length;
  $("thefts").textContent = last5.filter((l) => l.ev === "move" && l.from).length;
  $("log").replaceChildren(
    ...recent.slice(0, 60).map((l) => {
      const li = document.createElement("li");
      li.dataset.ev = l.ev;
      const t = document.createElement("time");
      t.dateTime = l.t;
      t.textContent = time.format(new Date(l.t));
      const who = document.createElement("code");
      who.textContent = l.who;
      li.append(t, " ", who, " ", say(l));
      return li;
    }),
  );
}

await refresh();
setInterval(refresh, 1000);
