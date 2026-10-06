// The door is a box; each magnet sits at a fraction (x, y) of it, so the
// arrangement is the same on every screen. A move is saved when the drag ends,
// or shortly after the last arrow key.
const door = document.getElementById("door");
const status = document.getElementById("status");
const els = new Map();

const clamp = (n) => Math.min(1, Math.max(0, n));

function place(el, m) {
  el.style.left = `${m.x * 100}%`;
  el.style.top = `${m.y * 100}%`;
  el.classList.toggle("mine", m.mine);
}

async function save(el) {
  const x = parseFloat(el.style.left) / 100;
  const y = parseFloat(el.style.top) / 100;
  const res = await fetch(`/api/magnets/${el.dataset.id}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ x, y }),
  });
  if (res.ok) {
    const { magnet } = await res.json();
    place(el, magnet);
    status.textContent = "";
  } else {
    status.textContent = "That move didn't save. Try again.";
  }
}

function magnet(m) {
  const el = document.createElement("button");
  el.className = "magnet";
  el.type = "button";
  el.dataset.id = m.id;
  el.textContent = m.text;
  place(el, m);

  let start = null;
  el.addEventListener("pointerdown", (e) => {
    const box = door.getBoundingClientRect();
    start = { px: e.clientX, py: e.clientY, x: m.x, y: m.y, box };
    el.setPointerCapture(e.pointerId);
    el.classList.add("held");
  });
  el.addEventListener("pointermove", (e) => {
    if (!start) return;
    m.x = clamp(start.x + (e.clientX - start.px) / start.box.width);
    m.y = clamp(start.y + (e.clientY - start.py) / start.box.height);
    el.style.left = `${m.x * 100}%`;
    el.style.top = `${m.y * 100}%`;
  });
  el.addEventListener("pointerup", () => {
    if (!start) return;
    start = null;
    el.classList.remove("held");
    save(el);
  });

  let timer;
  el.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 0.05 : 0.01;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    m.x = clamp(m.x + d[0]);
    m.y = clamp(m.y + d[1]);
    el.style.left = `${m.x * 100}%`;
    el.style.top = `${m.y * 100}%`;
    clearTimeout(timer);
    timer = setTimeout(() => save(el), 400);
  });
  return el;
}

const res = await fetch("/api/magnets");
const { magnets } = await res.json();
for (const m of magnets) {
  const el = magnet(m);
  els.set(m.id, el);
  door.append(el);
}
