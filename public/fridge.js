// The door is a box; each magnet sits at a fraction (x, y) of it, so the
// arrangement is the same on every screen. A move is saved when the drag ends,
// or shortly after the last arrow key.
//
// Two orders, kept apart: the DOM stays in vocabulary order so the Tab order
// never changes, and stacking is z-index, following the server's order (last
// moved is on top), set as --z so the held and focused styles can still
// lift a word above the rest.
const door = document.getElementById("door");
const status = document.getElementById("status");
let top = 0;
// id -> { el, m, busy }, so a move from someone else can find its magnet
const live = new Map();

function place(el, m) {
  el.style.left = `${m.x * 100}%`;
  el.style.top = `${m.y * 100}%`;
  el.classList.toggle("mine", m.mine);
}

// Keep the whole word on the door: its top-left corner can go no further than
// the door's size minus its own.
function clamp(el, m) {
  const maxX = Math.max(0, 1 - el.offsetWidth / door.clientWidth);
  const maxY = Math.max(0, 1 - el.offsetHeight / door.clientHeight);
  m.x = Math.min(maxX, Math.max(0, m.x));
  m.y = Math.min(maxY, Math.max(0, m.y));
}

async function save(el, m) {
  el.style.setProperty("--z", ++top);
  const res = await fetch(`/api/magnets/${m.id}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ x: m.x, y: m.y }),
  });
  if (res.ok) {
    // Only ownership comes back: the position may have moved on since this
    // request left, and the local one is newer.
    m.mine = (await res.json()).magnet.mine;
    place(el, m);
    status.textContent = "";
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
  const end = () => {
    start = null;
    el.classList.remove("held");
  };
  el.addEventListener("pointerdown", (e) => {
    start = { px: e.clientX, py: e.clientY, x: m.x, y: m.y, box: door.getBoundingClientRect() };
    el.setPointerCapture(e.pointerId);
    el.classList.add("held");
  });
  el.addEventListener("pointermove", (e) => {
    if (!start) return;
    m.x = start.x + (e.clientX - start.px) / start.box.width;
    m.y = start.y + (e.clientY - start.py) / start.box.height;
    clamp(el, m);
    place(el, m);
  });
  el.addEventListener("pointerup", () => {
    if (!start) return;
    const moved = m.x !== start.x || m.y !== start.y;
    end();
    if (moved) save(el, m);
  });
  // The browser took the pointer away (a system gesture, say): put the word
  // back where the drag began, since nothing was saved.
  el.addEventListener("pointercancel", () => {
    if (!start) return;
    Object.assign(m, { x: start.x, y: start.y });
    place(el, m);
    end();
  });

  let timer;
  el.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 0.05 : 0.01;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    m.x += d[0];
    m.y += d[1];
    clamp(el, m);
    place(el, m);
    el.style.setProperty("--z", ++top);
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      save(el, m);
    }, 400);
  });
  // A word this visitor is dragging or arrow-keying is theirs on screen until
  // they let go; a move from someone else in the meantime is not drawn.
  live.set(m.id, { el, m, busy: () => start !== null || timer != null });
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

function apply(update) {
  const entry = live.get(update.id);
  if (!entry || entry.busy()) return;
  Object.assign(entry.m, { x: update.x, y: update.y, mine: update.mine });
  place(entry.el, entry.m);
  entry.el.style.setProperty("--z", ++top);
}

// Every move anyone makes arrives here, including this visitor's own (which
// changes nothing). EventSource reconnects by itself after a drop; moves made
// while it was away are caught up by re-reading the whole door.
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
