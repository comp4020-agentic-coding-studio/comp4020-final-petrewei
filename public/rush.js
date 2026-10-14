// Fridge Rush in the browser. The server holds the game and streams it after
// every change; this page draws it and sends taps. Spelling happens here:
// tap tray letters (or type them) to build a word, then play it.
const $ = (id) => document.getElementById(id);
const door = $("door");
let game = null;
let spelling = []; // ids of tray tiles, in order
const doorTiles = new Map(); // id -> button, kept across updates

const post = async (path, body) => {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return res.json();
};
const say = (text, good = false) => {
  $("status").textContent = text;
  $("status").dataset.good = good ? "yes" : "no";
};

function tile(t, cls) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `tile ${cls}`;
  b.textContent = t.ch.toUpperCase();
  b.dataset.ch = t.ch;
  return b;
}

function draw() {
  if (!game) return;
  const g = game;
  const left = Math.max(0, Math.round((g.endsAt - Date.now()) / 1000));
  $("phase").textContent = g.phase === "play" ? "Round ends in" : g.phase === "break" ? "Next round in" : `Waiting for a second player (${g.players} here)`;
  $("clock").textContent = g.phase === "lobby" ? "" : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  document.body.dataset.phase = g.phase;

  $("board").replaceChildren(
    ...g.board.map((b) => {
      const li = document.createElement("li");
      li.style.setProperty("--hue", b.hue);
      li.classList.toggle("you", b.you);
      li.textContent = `${b.you ? "You" : b.name} ${Math.round(b.score)}`;
      return li;
    }),
  );

  // The door: every free letter in its cell. Tiles are kept and moved rather
  // than rebuilt, so a tap never lands on a button replaced mid-click.
  const onDoor = new Set(g.door.map((t) => t.id));
  for (const [id, b] of doorTiles) {
    if (!onDoor.has(id)) {
      b.remove();
      doorTiles.delete(id);
    }
  }
  for (const t of g.door) {
    let b = doorTiles.get(t.id);
    if (!b) {
      b = tile(t, "free");
      b.addEventListener("click", async () => {
        b.disabled = true;
        const r = await post("/api/snatch", { id: t.id });
        b.disabled = false;
        if (!r.ok) say(r.why === "your tray is full" ? "Your tray is full: play a word or drop a letter." : "Too slow! Someone grabbed it.");
      });
      doorTiles.set(t.id, b);
      door.append(b);
    }
    b.style.left = `${t.x * 100}%`;
    b.style.top = `${t.y * 100}%`;
  }

  // rivals: their trays, each letter a steal
  const canSteal = Date.now() >= g.you.stealAt;
  $("rivals").replaceChildren(
    ...g.rivals.map((r) => {
      const box = document.createElement("div");
      box.className = "rival";
      box.style.setProperty("--hue", r.hue);
      const h = document.createElement("h3");
      h.textContent = `${r.name} · ${r.score}`;
      const tray = document.createElement("div");
      tray.className = "rival-tray";
      for (const t of r.tray) {
        const b = tile(t, canSteal ? "stealable" : "locked");
        b.title = canSteal ? `Steal ${t.ch.toUpperCase()}` : "You can steal again in a moment";
        b.addEventListener("click", async () => {
          const res = await post("/api/steal", { from: r.id, id: t.id });
          say(res.ok ? `You stole ${t.ch.toUpperCase()}!` : "You can't steal yet.", res.ok);
        });
        tray.append(b);
      }
      box.append(h, tray);
      return box;
    }),
  );

  // your tray, and the word you're spelling from it
  $("me-name").textContent = g.you.name;
  $("me-name").style.setProperty("--hue", g.you.hue);
  const me = g.board.find((b) => b.you);
  $("me-score").textContent = me ? `${Math.round(me.score)} points` : "";
  const ids = new Set(g.you.tray.map((t) => t.id));
  spelling = spelling.filter((id) => ids.has(id));
  $("tray").replaceChildren(
    ...g.you.tray.map((t) => {
      const b = tile(t, spelling.includes(t.id) ? "mine used" : "mine");
      b.addEventListener("click", () => {
        if (spelling.includes(t.id)) spelling = spelling.filter((id) => id !== t.id);
        else spelling.push(t.id);
        draw();
      });
      b.addEventListener("contextmenu", async (e) => {
        e.preventDefault();
        await post("/api/drop", { id: t.id });
      });
      return b;
    }),
  );
  const word = spelling.map((id) => g.you.tray.find((t) => t.id === id).ch).join("");
  $("word").textContent = word.toUpperCase() || "Tap your letters to spell";
  $("play").disabled = word.length < 3 || g.phase !== "play";

  $("feed").replaceChildren(
    ...g.feed.map((f) => {
      const li = document.createElement("li");
      li.textContent = f.text;
      return li;
    }),
  );
  $("best").replaceChildren(
    ...g.best.map((b) => {
      const li = document.createElement("li");
      li.textContent = `${b.word.toUpperCase()} ${b.points} · ${b.name}`;
      return li;
    }),
  );
}

async function play() {
  const word = spelling.map((id) => game.you.tray.find((t) => t.id === id).ch).join("");
  if (word.length < 3) return;
  const r = await post("/api/play", { word });
  if (r.ok) {
    say(`${r.word.toUpperCase()}! +${r.points}`, true);
    spelling = [];
  } else {
    say({ "not a word": `${word.toUpperCase()} isn't a word.`, taken: `Someone already played ${word.toUpperCase()} this round.`, "not in your tray": "Those letters aren't all yours any more." }[r.why] ?? "Not now.");
  }
}

$("play").addEventListener("click", play);
$("clear").addEventListener("click", () => {
  spelling = [];
  draw();
});

// Typing spells from your tray: letters add, Backspace removes, Enter plays.
document.addEventListener("keydown", (e) => {
  if (!game || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === "Enter") return play();
  if (e.key === "Backspace") {
    spelling.pop();
    return draw();
  }
  const ch = e.key.toLowerCase();
  if (!/^[a-z]$/.test(ch)) return;
  const free = game.you.tray.find((t) => t.ch === ch && !spelling.includes(t.id));
  if (free) {
    spelling.push(free.id);
    draw();
  }
});

// The server drops a player it hasn't heard from in 15s, so a page that is
// still open says so every 5s.
setInterval(() => post("/api/alive", {}), 5_000);

const events = new EventSource("/api/events");
events.addEventListener("message", (e) => {
  game = JSON.parse(e.data);
  draw();
});
// Only the clock needs redrawing between updates.
setInterval(() => {
  if (!game) return;
  const left = Math.max(0, Math.round((game.endsAt - Date.now()) / 1000));
  $("clock").textContent = game.phase === "lobby" ? "" : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
}, 250);
