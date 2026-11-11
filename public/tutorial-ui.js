import { element, button, input } from "./dom.js";
import { T } from "./i18n.js";
import { SHARES } from "./ticket.js";
import { autoMove, currentStep as planStep } from "./plan.js";
import { refresh as retip } from "./tips.js";
/** @param {{ getState: () => import("./protocol.js").State | null, getMode: () => import("./protocol.js").Mode, getChoice: () => { leverage: number, share: number }, getLadder: () => number[], getLanguage: () => "en" | "ja" | "zh", isFresh: () => boolean, act: (kind: string, args?: object) => unknown, t: (key: string, args?: object) => string }} options */
export function createTutorial({ getState, getMode, getChoice, getLadder, getLanguage, isFresh, act, t }) {
  const $ = element;
  const controller = new AbortController();
  let disposed = false;
  let slideFrame = 0;
  /** @template {keyof WindowEventMap} K @param {K} name @param {(event: WindowEventMap[K]) => void} callback @param {boolean | AddEventListenerOptions} [options] */
  function listenWindow(name, callback, options) { window.addEventListener(name, callback, typeof options === "boolean" ? { capture: options, signal: controller.signal } : { ...options, signal: controller.signal }); }
  // The tutorial is played like a disc: it waits stopped until Play, Pause holds it where it is and Play
  // carries on, Stop goes back to lesson 1 and waits. The server keeps the state; these only ask for it.
  /** @param {string} kind */
  const transportOf = (kind) => () => {
    looked = 0;
    armedFor = null;
    return act(kind);
  };
  $("lesson-play").onclick = () => transportOf(playing() ? "pause" : "play")();
  $("lesson-stop").onclick = transportOf("stop");
  $("lesson-skip").onclick = () => act("skip");
  $("lesson-n").onchange = (e) => act("lesson", { at: Number(/** @type {HTMLSelectElement} */ (e.target).value) });
  // Previous, as on a disc: once starts this lesson over, twice within two seconds goes to the one before.
  let lastBack = 0;
  $("lesson-back").onclick = () => {
    const again = Date.now() - lastBack < 2000;
    lastBack = again ? 0 : Date.now();
    looked = 0;
    armedFor = null;
    act(again ? "back" : "again");
  };
  // The same keys on the keyboard, whichever control has focus: Space plays and pauses, the arrows go
  // back and skip, Escape stops. A key typed in a field, or on a button or slider that uses it, is left
  // to that control, and so is any key while a dialog is open or on any page but the tutorial.
  /** @type {Record<string, string>} */
  const TRANSPORT_KEYS = { " ": "lesson-play", ArrowLeft: "lesson-back", ArrowRight: "lesson-skip", Escape: "lesson-stop" };
  listenWindow("keydown", (e) => {
    const id = TRANSPORT_KEYS[e.key];
    if (!id || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || getMode() !== "tutorial" || !getState()?.lesson) return;
    if (document.querySelector("dialog[open]")) return;
    const target = e.target instanceof HTMLElement ? e.target : null;
    if (target?.isContentEditable || /^(INPUT|SELECT|TEXTAREA|A)$/.test(target?.tagName ?? "")) return;
    // a focused button does its own work on Space and Enter; the arrows and Escape are ours
    if (target?.tagName === "BUTTON" && e.key === " ") return;
    if (button(id).disabled) return;
    e.preventDefault();
    $(id).click();
  });

  // The tutorial names the controls a lesson is about; the page highlights
  // them.
  // The exact element each step of a lesson points at (ADR 0052): the slider
  // and not its whole block, the one button, the one figure. A step is lit while
  // the page can see it is still to do.
  /** @type {Record<string, string>} */
  const TARGETS = { chart: "chart", equity: "equity", leverage: "leverage", margin: "margin", buy: "buy", sell: "sell", close: "close", pnl: "pnl", level: "level", stop: "pexits", stopthumb: "psl-dist", borrow: "borrow" };
  /** @param {import("./protocol.js").State} s */
  function lesson(s) {
    $("lesson").hidden = !s.lesson;
    for (const el of document.querySelectorAll(".focus")) el.classList.remove("focus");
    if (!s.lesson) return;
    const l = s.lesson;
    // The transport shows its state: Play is Pause while playing, and the track keys wait for Play.
    const transport = s.transport ?? "playing";
    $("lesson").dataset.transport = transport;
    for (const id of ["lesson-back", "lesson-skip"]) button(id).disabled = transport === "stopped";
    button("lesson-stop").disabled = transport === "stopped";
    const verb = transport === "playing" ? "tutorialPause" : transport === "paused" ? "tutorialContinue" : "tutorialPlay";
    $("lesson-play").dataset.tip = verb;
    $("lesson-play").setAttribute("aria-label", t(verb));
    $("lesson-play").setAttribute("aria-pressed", String(transport === "playing"));
    const moving = s.phase === "moving";
    // The lesson in this language; in English, as the server sent it.
    const own = T[getLanguage()].lessons[l.id] ?? l;
    // the number is a list of every lesson, its own shown as "Lesson n of 10", the rest by title; it waits for Play
    const pick = /** @type {HTMLSelectElement} */ ($("lesson-n"));
    // at the end, an extra "done" entry is the one shown, and every lesson is still there to go back to
    const labels = l.all.map((x, i) => (i === l.n - 1 && !l.finished ? t("lessonN", { n: l.n, of: l.of }) : `${i + 1}. ${T[getLanguage()].lessons[x.id]?.title ?? x.title}`));
    if (l.finished) labels.push(t("lessonDone"));
    if ([...pick.options].map((o) => o.text).join("\n") !== labels.join("\n")) {
      pick.replaceChildren(...labels.map((text, i) => Object.assign(document.createElement("option"), { value: String(i), text, disabled: i === l.all.length })));
    }
    pick.value = String(l.finished ? l.all.length : l.n - 1);
    pick.disabled = transport === "stopped";
    $("lesson-title").textContent = l.finished ? t("doneTitle") : own.title;
    $("lesson-text").textContent = l.finished ? t("doneText") : own.text;
    $("lesson-task").textContent = l.finished ? t("doneTask") : transport === "stopped" ? t("pressPlay") : transport === "paused" ? t("pausedTask") : moving ? t("watch") : own.task;
    retip();
  }
  // How many of the lesson's looks the player has had (ADR 0052, 0053): a step
  // to look at waits for them, and they move on by a click or a key, or by
  // doing the next thing. A new lesson starts again. Pure choosing is in /plan.js.
  let looked = 0;
  /** @type {string | null} */
  let lookedIn = null;
  // A step whose control is not on screen yet (Close before there is a position,
  // Borrow before a wipe-out) is passed over: pointing at nothing helps no one.
  /** @param {HTMLElement} el */
  const onScreen = (el) => !!el && el.getClientRects().length > 0;
  /** @param {import("./protocol.js").Lesson} l */
  function currentStep(l) {
    if (lookedIn !== l.id) {
      lookedIn = l.id;
      looked = 0;
    }
    return planStep(l.plan ?? [], { choice: getChoice(), looked, moves: l.moves }, (s) => onScreen($(TARGETS[s.target])));
  }
  // When a step has waited AUTO_S seconds with no input, the tutorial does it
  // for the player (ADR 0054): a slider slides, a button is pressed through the
  // same server rules as a player's press, a look moves on. A countdown shows in
  // the step's words all that time, and any click, key or slider move starts it
  // again. It never runs while the page is hidden, a dialog is open, or the
  // price is moving.
  const AUTO_S = 9;
  // Whether the tutorial is playing, from the server's own transport: stopped and paused both hold.
  const playing = () => { const s = getState(); return s?.mode === "tutorial" && s.transport === "playing"; };
  // Stopped shows nothing, a blank screen that waits; paused keeps the frame, with the lit control and
  // the step's words and its seconds held; playing runs.
  const stopped = () => { const s = getState(); return s?.mode === "tutorial" && s.transport === "stopped"; };
  let autoLeft = AUTO_S;
  let autoTimer = 0;
  let sliding = false;
  function armAuto() {
    clearInterval(autoTimer);
    autoLeft = AUTO_S;
    const s = getState();
    if (!playing() || !s?.lesson || s.lesson.finished || s.phase === "moving") return;
    showCount();
    autoTimer = setInterval(tickAuto, 1000);
  }
  function tickAuto() {
    const l = getState()?.lesson;
    if (!l || l.finished || getState()?.phase === "moving") return clearInterval(autoTimer);
    if (!playing() || !isFresh() || document.hidden || document.querySelector("dialog[open]:not(#credit-offer)") || sliding) return;
    if (--autoLeft > 0) return showCount();
    clearInterval(autoTimer);
    doForPlayer(l);
  }
  function showCount() {
    if (hint.hidden || !hintFor) return;
    // The countdown leads the tip, so it is the first thing read and a long tip
    // can never cut it off (ADR 0059).
    const text = `${t("autoIn", { s: autoLeft })} · ${hintFor.words}`;
    if (hint.textContent !== text) {
      hint.textContent = text;
      placeHint(hintFor.el, text);
    }
  }
  /** @param {import("./protocol.js").Lesson} l */
  function doForPlayer(l) {
    const step = currentStep(l);
    const move = step && autoMove(step, l.id, l.plan, getChoice());
    if (!move) return armAuto();
    hint.textContent = `${t("autoIn", { s: 0 })} · ${hintFor?.words ?? ""}`;
    if ("slide" in move) slideTo(move.slide.slider, move.slide.value, armAuto);
    else if ("look" in move) {
      nextLook();
      armAuto();
    } else {
      act(move.act.kind, move.act);
      armAuto();
    }
  }
  // A slider moves to the value a step asks for, a few frames at a time, so the
  // player sees it go; it fires the same input events a hand would, so every
  // handler runs as usual. Reduced motion jumps there.
  /** @param {"leverage" | "margin"} which @param {number} value @param {() => void} done */
  function slideTo(which, value, done) {
    const slider = input(which);
    const target = which === "leverage" ? getLadder().indexOf(value) : SHARES.indexOf(value);
    const from = Number(slider.value);
    const steps = matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 24;
    let i = 0;
    sliding = true;
    const frame = () => {
      if (disposed) return;
      i++;
      slider.value = String(Math.round(from + ((target - from) * i) / steps));
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      if (i < steps) slideFrame = requestAnimationFrame(frame);
      else {
        slider.value = String(target);
        slider.dispatchEvent(new Event("input", { bubbles: true }));
        sliding = false;
        done();
      }
    };
    slideFrame = requestAnimationFrame(frame);
  }
  // Move on from the step to look at that is on show, if one is. Returns whether
  // it did, so a click on a control still does its own work.
  function nextLook() {
    if (!playing()) return false;
    const l = getState()?.lesson;
    if (!l || l.finished || getState()?.phase === "moving" || currentStep(l)?.until !== "look") return false;
    looked++;
    // A lesson of looks alone, the welcome, is over when the last look is: the
    // page tells the server, since there is no Next button (ADR 0057).
    if (!currentStep(l)) act("next");
    spotlight(l, false);
    return true;
  }
  // Any click, or Enter, moves on from a step to look at. The click carries on to whatever it
  // landed on, so pressing a control still does its job; a key typed in a field or on a control,
  // where the same key does something else, is left alone (ADR 0053). Space and the arrows are
  // the transport's now, so each key has one meaning.
  listenWindow("pointerdown", (e) => {
    if (e.target instanceof Element && e.target.closest("dialog[open]:not(#credit-offer), #name-box")) return;
    // A click on the lesson card's own buttons (the transport) is not a
    // click on the page: it must not move a look step on.
    if (!(e.target instanceof Element && e.target.closest("#lesson")) && nextLook()) return;
    if (getState()?.lesson && !getState()?.lesson?.finished && playing()) armAuto();
  });
  listenWindow("keydown", (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.key !== "Enter") return;
    const t = e.target instanceof HTMLElement ? e.target : null;
    if (document.querySelector("dialog[open]:not(#credit-offer)") || t?.isContentEditable || /^(INPUT|SELECT|TEXTAREA|BUTTON|A)$/.test(t?.tagName ?? "")) return;
    if (nextLook()) e.preventDefault();
  });
  // A key or a slider move by the player starts the countdown again.
  listenWindow("keydown", () => getState()?.lesson && !sliding && armAuto(), true);
  for (const id of ["leverage", "margin"]) input(id).addEventListener("input", () => !sliding && getState()?.lesson && armAuto(), { signal: controller.signal });
  // The step's words, in this language, kept beside the lit control: a small
  // label that follows it, so the instruction is where the eye already is.
  const hint = Object.assign(document.createElement("div"), { id: "step-hint", className: "step-hint", hidden: true });
  document.body.append(hint);
  /** @param {HTMLElement} el @param {string} text */
  function placeHint(el, text) {
    hint.textContent = text;
    hint.hidden = false;
    const r = el.getBoundingClientRect();
    const h = hint.getBoundingClientRect();
    const gap = 14;
    // A big target (the chart) has no outside to speak of: the words go inside
    // it, at its top left, where nothing else is.
    if (r.width > innerWidth * 0.5) {
      hint.style.left = `${r.left + 12}px`;
      hint.style.top = `${r.top + 12}px`;
      hint.dataset.side = "inside";
      return;
    }
    // Try each side and keep the one that covers the fewest other controls and
    // labels, and stays on the page: the words go where they hide least.
    const center = { x: r.left + r.width / 2 - h.width / 2, y: r.top + r.height / 2 - h.height / 2 };
    /** @type {Record<string, { x: number, y: number }>} */
    const sides = {
      left: { x: r.left - h.width - gap, y: center.y },
      right: { x: r.right + gap, y: center.y },
      below: { x: center.x, y: r.bottom + gap },
      above: { x: center.x, y: r.top - h.height - gap },
    };
    const others = [...document.querySelectorAll("button, input, label, dt, dd, output, h2, .task, .lesson-body p")].filter((e) => e !== el && !el.contains(e) && !e.contains(el) && !e.closest("#step-hint") && e.getClientRects().length);
    // Above and below slide sideways to stay on the page, so only running off
    // the top or bottom, or off the side for left and right, counts against them.
    /** @param {{ x: number, y: number }} p */
    const fit = (p) => ({ x: Math.max(4, Math.min(innerWidth - h.width - 4, p.x)), y: p.y });
    for (const s of ["below", "above"]) sides[s] = fit(sides[s]);
    /** @param {{ x: number, y: number }} p */
    const score = (p) => {
      const box = { left: p.x, top: p.y, right: p.x + h.width, bottom: p.y + h.height };
      const off = box.left < 4 || box.top < 4 || box.right > innerWidth - 4 || box.bottom > innerHeight - 4;
      // What it hides matters: a button or a slider costs most, a figure or a
      // label less, a heading or a paragraph least.
      /** @param {Element} e */
      const cost = (e) => (e.matches("button, input") ? 10 : e.matches("dt, dd, output, label") ? 3 : 1);
      const hit = others.filter((e) => { const b = e.getBoundingClientRect(); return b.width && b.right > box.left && b.left < box.right && b.bottom > box.top && b.top < box.bottom; }).reduce((n, e) => n + cost(e), 0);
      return (off ? 1000 : 0) + hit;
    };
    let best = "left";
    for (const s of ["left", "right", "below", "above"]) if (score(sides[s]) < score(sides[best])) best = s;
    hint.style.left = `${Math.max(4, Math.min(innerWidth - h.width - 4, sides[best].x))}px`;
    hint.style.top = `${Math.max(4, Math.min(innerHeight - h.height - 4, sides[best].y))}px`;
    hint.dataset.side = best;
  }
  // The pointer is the tutorial's alone: gone the moment another mode is on show,
  // or the tab changes, since only a tutorial's state has a lesson to clear it.
  function clearPointer() {
    cancelAnimationFrame(slideFrame);
    sliding = false;
    for (const el of document.querySelectorAll(".focus")) el.classList.remove("focus");
    hint.hidden = true;
    hintFor = null;
    armedFor = null;
    clearInterval(autoTimer);
  }
  /** @type {string | null} */
  let scrolledTo = null;
  /** @param {import("./protocol.js").Lesson} l @param {boolean} moving */
  function spotlight(l, moving) {
    for (const el of document.querySelectorAll(".focus")) el.classList.remove("focus");
    hint.hidden = true;
    hintFor = null;
    if (stopped() || l.finished || moving) return;
    const step = currentStep(l);
    if (!step) return;
    const el = $(TARGETS[step.target]);
    // A control below the fold is brought into view, once per step, or the ring
    // would be on something the player cannot see.
    const key = `${l.id}:${l.plan.indexOf(step)}`;
    if (scrolledTo !== key) {
      scrolledTo = key;
      const r = el.getBoundingClientRect();
      // Not merely on screen but with room around it for its words: within the
      // middle of the viewport, else it is brought to the centre.
      if (r.top < innerHeight * 0.15 || r.bottom > innerHeight * 0.8) el.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
    el.classList.add("focus");
    const i = l.plan.indexOf(step);
    const says = T[getLanguage()].lessons[l.id]?.steps?.[i] ?? step.say;
    const words = `${l.plan.length > 1 ? `${i + 1}/${l.plan.length} ` : ""}${says}`;
    placeHint(el, `${t("autoIn", { s: AUTO_S })} · ${words}`);
    // The words are placed against where the control is now, so when the page
    // is scrolling to it, they are placed again as it settles, and as the player
    // scrolls or resizes afterwards.
    hintFor = { el, words };
    // A new step starts the countdown afresh; a redraw of the same step does not.
    const stepKey = `${l.id}:${i}:${looked}`;
    if (stepKey !== armedFor) {
      armedFor = stepKey;
      armAuto();
    } else showCount();
  }
  /** @type {string | null} */
  let armedFor = null;
  /** @type {{ el: HTMLElement, words: string } | null} */
  let hintFor = null;
  let settle = 0;
  const replace = () => {
    clearTimeout(settle);
    settle = setTimeout(() => hintFor && !hint.hidden && placeHint(hintFor.el, `${t("autoIn", { s: autoLeft })} · ${hintFor.words}`), 60);
  };
  listenWindow("scroll", replace, { passive: true });
  listenWindow("resize", replace);

  return { lesson, spotlight, clearPointer, dispose() { disposed = true; clearPointer(); clearTimeout(settle); cancelAnimationFrame(slideFrame); controller.abort(); for (const id of ["lesson-play", "lesson-stop", "lesson-skip", "lesson-back"]) $(id).onclick = null; hint.remove(); } };
}
