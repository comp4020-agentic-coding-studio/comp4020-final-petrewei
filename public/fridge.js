// The door is a box; each magnet sits at a fraction (x, y) of it, so the
// arrangement is the same on every screen. A move is saved when the drag ends,
// or shortly after the last arrow key.
//
// Two orders, kept apart: the DOM stays in vocabulary order so the Tab order
// never changes, and stacking is z-index, following the server's order (last
// moved is on top), set as --z so the held and focused styles can still
// lift a word above the rest.
//
// One hand at a time (ADR 0002): picking a word up asks the server for it, and
// a word someone else is holding glows and can't be picked up.
const door = document.getElementById("door");
const status = document.getElementById("status");
let top = 0;
// id -> { el, m, busy }, so a move from someone else can find its magnet
const live = new Map();
const RENEW_MS = 10_000;

function place(el, m) {
  el.style.left = `${m.x * 100}%`;
  el.style.top = `${m.y * 100}%`;
  el.classList.toggle("mine", m.mine);
  el.classList.toggle("taken", m.held);
  el.setAttribute("aria-disabled", m.held ? "true" : "false");
  // what the outline and the glow say, for a screen reader
  el.setAttribute("aria-label", `${m.text}${m.mine ? ", yours" : ""}${m.held ? ", someone is holding it" : ""}`);
}

// A screen reader hears nothing of other people's moves unless told, and
// hearing every one would drown it out; so only the focused word is spoken.
const aloud = document.getElementById("aloud");
const say = (el, text) => {
  if (el === document.activeElement) aloud.textContent = text;
};

// Keep the whole word on the door: its top-left corner can go no further than
// the door's size minus its own.
function clamp(el, m) {
  const maxX = Math.max(0, 1 - el.offsetWidth / door.clientWidth);
  const maxY = Math.max(0, 1 - el.offsetHeight / door.clientHeight);
  m.x = Math.min(maxX, Math.max(0, m.x));
  m.y = Math.min(maxY, Math.max(0, m.y));
}

const post = (path, body) =>
  fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const letGo = (m) => post(`/api/magnets/${m.id}/release`);

// Restarts a one-off CSS animation, even if it is already running.
function replay(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

// Every reply and event carries the word's version (`v`), which the server
// raises on every move, hold and release. News about a word is applied only
// if it is newer than what this page has, so a reply that arrives late on a
// slow connection can't undo something the page has already heard.
function adopt(el, m, fresh) {
  if (fresh.v <= m.v) return false;
  Object.assign(m, { x: fresh.x, y: fresh.y, mine: fresh.mine, held: fresh.held, v: fresh.v });
  place(el, m);
  return true;
}

function refuse(el, m) {
  replay(el, "refused");
  status.textContent = `Someone else is holding “${m.text}”.`;
}

// A 409 carries the word as the server has it, so the page takes that
// rather than asking again, and says so if it is still held.
async function refused(el, m, res) {
  adopt(el, m, (await res.json()).magnet);
  if (m.held) refuse(el, m);
}

// Reaching for a word someone else holds: refuse at once, and still ask the
// server, so the reach is in its log (crit 10). If it was freed in the
// meantime the server grants it, and the hand lets go straight away.
function reach(el, m) {
  refuse(el, m);
  grab(el, m).then((ok) => ok && letGo(m));
}

// Resolves true if this visitor now holds the word.
async function grab(el, m) {
  const res = await post(`/api/magnets/${m.id}/grab`);
  if (res.status === 409) await refused(el, m, res);
  return res.ok;
}

async function save(el, m) {
  el.style.setProperty("--z", ++top);
  const res = await post(`/api/magnets/${m.id}`, { x: m.x, y: m.y });
  if (res.ok) {
    // Only ownership and version come back: the position may have moved on
    // since this request left, and the local one is newer.
    const { magnet } = await res.json();
    Object.assign(m, { mine: magnet.mine, v: Math.max(m.v, magnet.v) });
    place(el, m);
    status.textContent = "";
  } else if (res.status === 409) {
    await refused(el, m, res);
  } else {
    status.textContent = "That move didn't save. Try again.";
  }
}

function magnet(m) {
  const el = document.createElement("button");
  el.className = "magnet";
  el.type = "button";
  el.textContent = m.text;
  // a fixed slight tilt per word, as real magnets never sit square
  el.style.setProperty("--tilt", `${((Number(m.id.slice(1)) * 37) % 7) - 3}deg`);
  place(el, m);

  let start = null;
  let renewed = 0;
  const end = () => {
    start = null;
    el.classList.remove("held");
  };
  const back = (from) => {
    Object.assign(m, { x: from.x, y: from.y });
    place(el, m);
  };

  el.addEventListener("pointerdown", async (e) => {
    if (m.held) return reach(el, m);
    const from = { px: e.clientX, py: e.clientY, x: m.x, y: m.y, box: door.getBoundingClientRect() };
    start = from;
    renewed = Date.now();
    el.setPointerCapture(e.pointerId);
    el.classList.add("held");
    // The drag starts at once; if the server says someone got there first,
    // the word goes back and this visitor is told.
    if (!(await grab(el, m)) && start === from) {
      back(from);
      end();
    }
  });
  el.addEventListener("pointermove", (e) => {
    if (!start) return;
    m.x = start.x + (e.clientX - start.px) / start.box.width;
    m.y = start.y + (e.clientY - start.py) / start.box.height;
    clamp(el, m);
    place(el, m);
    if (Date.now() - renewed > RENEW_MS) {
      renewed = Date.now();
      // The hold lapsed and someone took the word: this drag is over.
      const from = start;
      grab(el, m).then((ok) => {
        if (ok || start !== from) return;
        back(from);
        end();
      });
    }
  });
  el.addEventListener("pointerup", () => {
    if (!start) return;
    const moved = m.x !== start.x || m.y !== start.y;
    end();
    // a move frees the word on the server; a click with no drag lets go of it
    if (moved) save(el, m);
    else letGo(m);
  });
  // The browser took the pointer away (a system gesture, say): put the word
  // back where the drag began, since nothing was saved, and let go of it.
  el.addEventListener("pointercancel", () => {
    if (!start) return;
    back(start);
    end();
    letGo(m);
  });

  let timer = null;
  let keyFrom = null;
  el.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 0.05 : 0.01;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    if (m.held) return reach(el, m);
    // the first arrow press picks the word up; the save after the last lets go
    if (timer === null) {
      const from = (keyFrom = { x: m.x, y: m.y });
      grab(el, m).then((ok) => {
        if (ok || keyFrom !== from) return;
        clearTimeout(timer);
        timer = null;
        keyFrom = null;
        back(from);
      });
    }
    m.x += d[0];
    m.y += d[1];
    clamp(el, m);
    place(el, m);
    el.style.setProperty("--z", ++top);
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      keyFrom = null;
      save(el, m);
    }, 400);
  });
  // A word this visitor is dragging or arrow-keying is theirs on screen until
  // they let go; a move from someone else in the meantime is not drawn.
  live.set(m.id, { el, m, busy: () => start !== null || timer !== null });
  return el;
}

const { magnets } = await (await fetch("/api/magnets")).json();
const els = magnets.map((m, i) => {
  const el = magnet(m);
  el.style.setProperty("--z", i);
  return [Number(m.id.slice(1)), el];
});
top = magnets.length;
door.append(...els.sort((a, b) => a[0] - b[0]).map(([, el]) => el));

// Someone moved a word this visitor placed. Point at where it went.
function stolen(update) {
  const entry = live.get(update.id);
  status.textContent = `Someone took “${update.text}” from you.`;
  if (entry) replay(entry.el, "stolen");
}

function apply(update) {
  if (update.type === "taken") return stolen(update);
  if (update.type === "poem") return archive(update);
  if (update.type === "presence") {
    document.getElementById("here").textContent =
      update.here === 1 ? "Just you at the fridge" : `${update.here} people at the fridge`;
    return;
  }
  const entry = live.get(update.id);
  if (!entry) return;
  const { el, m } = entry;
  if (update.v <= m.v) return;
  if (update.type === "held" || update.type === "released") {
    Object.assign(m, { held: update.type === "held", v: update.v });
    place(el, m);
    say(el, m.held ? `Someone picked up “${m.text}”.` : `“${m.text}” is free.`);
  } else if (!entry.busy()) {
    const moved = update.x !== m.x || update.y !== m.y;
    adopt(el, m, update);
    el.style.setProperty("--z", ++top);
    if (moved && !m.mine) say(el, `Someone moved “${m.text}”.`);
  }
  // a dropped word arrives as a move, so either way a free word clears its notice
  if (!m.held && status.textContent.includes(`“${m.text}”`)) status.textContent = "";
}

// The archive of broken lines (ADR 0003), newest first.
const list = document.getElementById("poems");
const SHOWN = 30;
const when = new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short" });

function poem({ text, at }) {
  const li = document.createElement("li");
  const q = document.createElement("q");
  q.textContent = text;
  const time = document.createElement("time");
  time.dateTime = at;
  time.textContent = when.format(new Date(at));
  li.append(q, time);
  return li;
}

function archive(p) {
  list.prepend(poem(p));
  while (list.children.length > SHOWN) list.lastElementChild.remove();
}

const { poems } = await (await fetch("/api/poems")).json();
list.append(...poems.slice(0, SHOWN).map(poem));

// Words taken while this visitor was away are told once, then cleared.
const { taken } = await (await fetch("/api/taken")).json();
if (taken.length > 0) {
  const list = [...new Set(taken)].map((t) => `“${t}”`).join(", ");
  status.textContent = `While you were away, someone took ${list}.`;
  post("/api/taken/seen");
}

// Every move, pick-up, let-go and theft notice arrives here. EventSource
// reconnects by itself after a drop; whatever changed while it was away is
// caught up by re-reading the whole door.
let opened = false;
const events = new EventSource("/api/events");
events.addEventListener("open", async () => {
  if (opened) {
    const { magnets: now } = await (await fetch("/api/magnets")).json();
    now.forEach(apply);
  }
  opened = true;
});
events.addEventListener("message", (e) => apply(JSON.parse(e.data)));
