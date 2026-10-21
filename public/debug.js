// The hidden debug console (ADR 0019), served only to the operator in
// debug mode. The backtick key (`) or the DEBUG tag opens it. Every
// button asks the server, which checks the debug cookie and does the
// work where the rules live; this page only shows the answers. It is in
// English only: it is for the operator, not for players.
const tab = () => document.querySelector("[role=tab][aria-selected=true]")?.dataset.mode ?? "history";

const tag = Object.assign(document.createElement("button"), { className: "dbg-tag", type: "button", textContent: "DEBUG", title: "Debug console (`)" });
const box = Object.assign(document.createElement("aside"), { className: "dbg", hidden: true });
box.setAttribute("aria-label", "Debug console");
box.innerHTML = `
  <header><strong>Debug console</strong><span class="dbg-hint">\` to toggle</span><button type="button" data-close>✕</button></header>
  <section><h3>Round <small data-mode></small></h3>
    <div class="dbg-row">
      <button type="button" data-do="start">Start now</button>
      <button type="button" data-do="end">End at the bell</button>
      <button type="button" data-do="lobby">Back to lobby</button>
    </div></section>
  <section><h3>My account</h3>
    <div class="dbg-row">
      <button type="button" data-do="call">Margin call</button>
      <button type="button" data-do="cut">Losscut</button>
      <button type="button" data-do="reset-me">Reset money</button>
    </div></section>
  <section><h3>Hall of fame</h3>
    <div class="dbg-row"><button type="button" class="danger" data-do="reset-fame" data-confirm="Reset the hall of fame for everyone? This cannot be undone.">Reset the hall</button></div></section>
  <section><h3>Status</h3><pre data-status></pre>
    <div class="dbg-row"><button type="button" data-do="status">Refresh</button><a href="?debug=off">Turn debug off</a></div></section>
  <p class="dbg-out" role="status" data-out></p>`;
document.body.append(tag, box);

const $ = (sel) => box.querySelector(sel);
async function run(kind) {
  const res = await fetch("/api/debug", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, mode: tab() }) });
  const out = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  $("[data-out]").textContent = out.error ? `✕ ${kind}: ${out.error}` : `✓ ${kind}`;
  $("[data-out]").className = `dbg-out ${out.error ? "bad" : "good"}`;
  if (out.status) $("[data-status]").textContent = JSON.stringify(out.status, null, 2);
  else if (kind !== "status") run("status");
}
function toggle(open = box.hidden) {
  box.hidden = !open;
  $("[data-mode]").textContent = `(${tab()} tab)`;
  if (open) run("status");
}
tag.onclick = () => toggle();
$("[data-close]").onclick = () => toggle(false);
for (const b of box.querySelectorAll("[data-do]")) {
  b.onclick = () => {
    if (b.dataset.confirm && !confirm(b.dataset.confirm)) return;
    run(b.dataset.do);
  };
}
addEventListener("keydown", (e) => {
  if (e.key !== "`" || e.target.closest?.("input, textarea, select")) return;
  e.preventDefault();
  toggle();
});
