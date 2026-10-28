// Tips (ADR 0025): one floating tip for the whole page, shown at once on
// keyboard focus and after a moment's hover, in place of the browser's
// slow, plain title. An element names its tip by key (data-tip, looked up
// in the page's language) or carries its text (data-tip-text, for tips
// that change, such as your code). A screen reader hears it too.
let words = () => "";
let infoWords = () => "";
// A popover, so it sits in the top layer: over a dialog, not under it.
const tip = Object.assign(document.createElement("div"), { id: "tip", className: "tip", role: "tooltip", hidden: true });
tip.popover = "manual";
document.body.append(tip);
let over = null;
let timer = 0;

// Text the page set beats a key, since it carries values such as a code. An
// info button (ADR 0049) speaks the explanation of its own key, never the
// hover tip of the label beside it.
const textOf = (el) => (el.dataset.info ? infoWords(el.dataset.info) : el.dataset.tipText || (el.dataset.tip ? words(el.dataset.tip) : ""));

function show(el) {
  const text = textOf(el);
  if (!text) return hide();
  over = el;
  tip.textContent = text;
  tip.hidden = false;
  if (!tip.matches(":popover-open")) tip.showPopover?.();
  el.setAttribute("aria-describedby", "tip");
  // Above the element if it fits, else below; never off either side.
  const r = el.getBoundingClientRect();
  const t = tip.getBoundingClientRect();
  const gap = 8;
  const above = r.top - t.height - gap;
  const top = above >= 4 ? above : r.bottom + gap;
  const left = Math.min(innerWidth - t.width - 4, Math.max(4, r.left + r.width / 2 - t.width / 2));
  tip.style.top = `${top}px`;
  tip.style.left = `${left}px`;
  tip.classList.toggle("below", above < 4);
}
function hide() {
  clearTimeout(timer);
  if (over) over.removeAttribute("aria-describedby");
  over = null;
  if (tip.matches(":popover-open")) tip.hidePopover?.();
  tip.hidden = true;
}

// The element under the pointer or focus that has a tip, if any.
const owner = (target) => target?.closest?.("[data-info], [data-tip], [data-tip-text]");
// An info button pinned open by a click or tap, until a second click, Escape
// or a click elsewhere.
let pinned = null;
function unpin() {
  if (!pinned) return;
  pinned.setAttribute("aria-expanded", "false");
  pinned = null;
  hide();
}
addEventListener("click", (e) => {
  const el = e.target?.closest?.("[data-info]");
  if (!el) return unpin();
  if (pinned === el) return unpin();
  if (pinned) pinned.setAttribute("aria-expanded", "false");
  pinned = el;
  el.setAttribute("aria-expanded", "true");
  show(el);
});

addEventListener("pointerover", (e) => {
  if (e.pointerType === "touch" || pinned) return;
  const el = owner(e.target);
  if (el === over) return;
  clearTimeout(timer);
  if (!el) return hide();
  timer = setTimeout(() => show(el), over ? 0 : 250);
});
addEventListener("pointerdown", (e) => {
  // A long press shows a tip on a touch screen; a tap goes on as a click.
  if (pinned) return;
  if (e.pointerType !== "touch") return hide();
  const el = owner(e.target);
  clearTimeout(timer);
  if (el) timer = setTimeout(() => show(el), 450);
});
addEventListener("pointerup", () => clearTimeout(timer));
addEventListener("focusin", (e) => {
  const el = owner(e.target);
  if (el && e.target.matches(":focus-visible")) show(el);
});
addEventListener("focusout", () => !pinned && hide());
addEventListener("keydown", (e) => e.key === "Escape" && (pinned ? unpin() : hide()));
addEventListener("scroll", () => !pinned && hide(), { passive: true });

// The page passes its own lookup, so tips follow its language; a tip
// already showing is refreshed when its text changes underneath it.
export function useWords(lookup) {
  words = lookup;
}
// The same for the explanations the info buttons carry.
export function useInfo(lookup) {
  infoWords = lookup;
}
export function refresh() {
  if (over) show(over);
}
