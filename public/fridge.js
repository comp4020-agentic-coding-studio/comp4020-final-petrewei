// The door is a box; each magnet sits at a fraction (x, y) of it, so the
// arrangement is the same on every screen. A move is saved when the drag ends,
// or shortly after the last arrow key.
const door = document.getElementById("door");
const status = document.getElementById("status");

const clamp = (n) => Math.min(1, Math.max(0, n));

// The anchor slides with the position (a magnet at x=1 has its right edge on
// the door's right edge), so every fraction 0..1 keeps the whole word on the
// door without measuring it.
function place(el, m) {
  el.style.left = `${m.x * 100}%`;
  el.style.top = `${m.y * 100}%`;
  el.style.transform = `translate(${-m.x * 100}%, ${-m.y * 100}%)`;
  el.classList.toggle("mine", m.mine);
}

async function save(el, m) {
  const res = await fetch(`/api/magnets/${m.id}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ x: m.x, y: m.y }),
  });
  if (res.ok) {
    Object.assign(m, (await res.json()).magnet);
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
  place(el, m);

  let start = null;
  el.addEventListener("pointerdown", (e) => {
    // The last magnet touched goes on top, as the server orders them, so the
    // word you grab next is the one you can see.
    door.append(el);
    start = { px: e.clientX, py: e.clientY, x: m.x, y: m.y, box: door.getBoundingClientRect() };
    el.setPointerCapture(e.pointerId);
    el.classList.add("held");
  });
  el.addEventListener("pointermove", (e) => {
    if (!start) return;
    m.x = clamp(start.x + (e.clientX - start.px) / start.box.width);
    m.y = clamp(start.y + (e.clientY - start.py) / start.box.height);
    place(el, m);
  });
  el.addEventListener("pointerup", () => {
    if (!start) return;
    const moved = m.x !== start.x || m.y !== start.y;
    start = null;
    el.classList.remove("held");
    if (moved) save(el, m);
  });

  let timer;
  el.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 0.05 : 0.01;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    m.x = clamp(m.x + d[0]);
    m.y = clamp(m.y + d[1]);
    place(el, m);
    clearTimeout(timer);
    timer = setTimeout(() => save(el, m), 400);
  });
  return el;
}

const { magnets } = await (await fetch("/api/magnets")).json();
door.append(...magnets.map(magnet));
