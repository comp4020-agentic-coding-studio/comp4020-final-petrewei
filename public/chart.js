import { element } from "./dom.js";
import { PERIODS, bollinger, closes, rsi, sma, spanOf, stack } from "./indicators.js";
import { place, windowed } from "./view.js";
import { svg } from "./avatars.js";
import { quoted } from "./format.js";
import { pct } from "./ticket.js";
/** @param {{ getState: () => import("./protocol.js").State | null, getLanguage: () => "en" | "ja" | "zh", t: (key: string) => string }} options */
export function createChart({ getState, getLanguage, t }) {
  const $ = element;
  const canvasNode = $("chart");
  if (!(canvasNode instanceof HTMLCanvasElement)) throw new Error("Expected chart canvas");
  const canvas = canvasNode;
  /** @param {number} n */
  const tone = (n) => (n > 0 ? "up" : n < 0 ? "down" : "");
  /** @param {import("./protocol.js").State} s */
  const perDay = (s) => s.dayTicks / s.steps;
  /** @type {(() => void)[]} */
  const cleanup = [];
  /** @param {EventTarget} target @param {string} name @param {EventListener} callback */
  const listen = (target, name, callback) => { target.addEventListener(name, callback); cleanup.push(() => target.removeEventListener(name, callback)); };
  let disposed = false;
  let frame = 0;
  function redraw() { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { const state = getState(); if (!disposed && state) draw(state); }); }
  // Which indicators are on, remembered in this browser. MA and RSI start
  // on, the bands off, so a first chart is not a tangle.
  const studies = (() => {
    try {
      return { ma: true, bb: false, rsi: true, ...JSON.parse(localStorage.getItem("studies") ?? "{}") };
    } catch {
      return { ma: true, bb: false, rsi: true };
    }
  })();
  for (const b of document.querySelectorAll("#studies button")) {
    if (!(b instanceof HTMLButtonElement)) continue;
    const study = b.dataset.study;
    if (!study) continue;
    b.setAttribute("aria-pressed", String(studies[study]));
    b.onclick = () => {
      studies[study] = !studies[study];
      b.setAttribute("aria-pressed", String(studies[study]));
      try {
        localStorage.setItem("studies", JSON.stringify(studies));
      } catch {
        // a private window: the choice lasts this visit
      }
      const state = getState(); if (state) draw(state);
    };
  }

  // A face as an image the chart can draw, made once from its pixel art and kept: a canvas
  // cannot draw the SVG string the rest of the page puts in the DOM.
  /** @type {Map<string, HTMLImageElement>} */
  const faces = new Map();
  /** @param {string} face */
  function faceImage(face) {
    let img = faces.get(face);
    if (!img) {
      img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg(face, 16))}`;
      img.onload = redraw;
      faces.set(face, img);
    }
    return img;
  }
  // The colour class of a gain or a loss.

  // The candles last drawn, each with its centre on the chart and its prices, for the pointer's reading (ADR 0083).
  /** @type {{ cx: number, open: number, high: number, low: number, close: number, half: number, top: number }[]} */
  let candlesShown = [];
  // A pointer over the chart reads the candle under it: its open, high, low and close, and its change, in a box that
  // keeps clear of the pointer. Nothing is drawn on the chart, so moving the pointer never redraws it.
  /** @param {PointerEvent} e */
  function readCandle(e) {
    const box = $("chart").getBoundingClientRect();
    const px = e.clientX - box.left;
    const py = e.clientY - box.top;
    const c = candlesShown.find((c) => Math.abs(c.cx - px) <= Math.max(c.half, 3));
    if (!c || py > c.top) return void ($("ohlc").hidden = true);
    const change = c.close / c.open - 1;
    /** @type {[string, number][]} */
    const readings = [["O", c.open], ["H", c.high], ["L", c.low], ["C", c.close]];
    $("ohlc").replaceChildren(...readings.map(([k, v]) => {
      const row = document.createElement("span");
      row.append(Object.assign(document.createElement("i"), { textContent: k }), quoted(v));
      return row;
    }), Object.assign(document.createElement("b"), { className: tone(change), textContent: pct(change) }));
    $("ohlc").hidden = false;
    // beside the pointer, on the side away from the price scale when there is room
    const left = px + 14 + $("ohlc").offsetWidth < box.width - 70 ? px + 14 : px - 14 - $("ohlc").offsetWidth;
    $("ohlc").style.left = `${Math.max(4, left)}px`;
    $("ohlc").style.top = `${Math.max(4, py - 20)}px`;
  }
  $("chart").addEventListener("pointermove", readCandle);
  cleanup.push(() => $("chart").removeEventListener("pointermove", readCandle));
  listen($("chart"), "pointerleave", () => ($("ohlc").hidden = true));

  /** @param {import("./protocol.js").State} full */
  function draw(full) {
    const s = windowed(full);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (!s.prices.length) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      candlesShown = [];
      return;
    }
    // The chart is drawn in the CSS pixels it is shown at (ADR 0076), so its text and margins keep their size however the
    // layout sizes the box, and it is sharp on a scaled screen: the canvas holds that many device pixels and the drawing
    // is scaled to them. Before the box has a size (hidden, or folded), it keeps the size it last had.
    const ratio = devicePixelRatio || 1;
    const w = canvas.clientWidth || canvas.width / ratio;
    const boxH = canvas.clientHeight || canvas.height / ratio;
    const [pw, ph] = [Math.round(w * ratio), Math.round(boxH * ratio)];
    // a new size clears the canvas, so it is set only when the box has changed
    if (canvas.width !== pw || canvas.height !== ph) [canvas.width, canvas.height] = [pw, ph];
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    // With the RSI on, the price takes the top and the RSI a pane below; the canvas, and so the layout, keeps its size.
    const pane = studies.rsi && s.mode !== "tutorial" ? 84 : 0;
    const h = boxH - pane;
    const css = getComputedStyle(document.documentElement);
    ctx.fillStyle = css.getPropertyValue("--chart");
    ctx.fillRect(0, 0, w, boxH);
    const prices = s.prices;
    const latest = prices.at(-1);
    if (latest === undefined) return;
    const k = s.steps;
    // Indicators on each day's close, drawn at the day's centre; the bands
    // widen the price range so they stay on the chart.
    const tutorial = s.mode === "tutorial";
    // Each indicator is worked out on every day there is, then cut to the days shown.
    /** @template T @param {T[]} values */
    const cut = (values) => values.slice(s.skip ?? 0);
    const days = closes(s.all ?? prices, k);
    const bands = studies.bb && !tutorial ? cut(bollinger(days, PERIODS.band, 2)) : [];
    const shown = bands.filter((band) => band !== null);
    // The stop and the margin lines join the scale when they are near
    // (within 3%, as at 100× and up), so high leverage shows how close the
    // losscut is.
    const pos = s.you.pos;
    const near = pos ? [pos.stop, pos.take, pos.call, pos.cut].flatMap((p) => typeof p === "number" && p > 0 && Math.abs(p / latest - 1) < 0.03 ? [p] : []) : [];
    const lo = Math.min(...prices, ...shown.map((b) => b.lower), ...near);
    const hi = Math.max(...prices, ...shown.map((b) => b.upper), ...near);
    const pad = (hi - lo) * 0.15 || hi * 0.002;
    const top = hi + pad;
    const bottom = lo - pad;
    // The newest tick sits at the right edge and older ones count back from it; with no
    // history (the tutorial) the round runs from the left as it always did.
    /** @param {number} i */
    const x = (i) => place(s, i) * (w - 70);
    // The price scale leaves HEAD pixels at the top for the quote that floats there.
    const HEAD = 66;
    /** @param {number} p */
    const y = (p) => h - ((p - bottom) / (top - bottom)) * (h - HEAD);
    // Day lines, and the price grid on the right.
    ctx.strokeStyle = css.getPropertyValue("--chart-grid");
    ctx.lineWidth = 1;
    const up = css.getPropertyValue("--up");
    const down = css.getPropertyValue("--down");
    ctx.fillStyle = css.getPropertyValue("--muted");
    ctx.font = "12px 'JetBrains Mono', ui-monospace, monospace";
    // One line a day, found by the tick's own count from the bell and not by its place on screen, so the lines
    // stay on the day breaks as the window slides; the tutorial has no days and keeps a line every 5 candles.
    // Each played day is named "D1".."D5" at its line, and the days of history before the bell have no name.
    const dayStep = s.dayTicks;
    const first = s.tick - (prices.length - 1);
    for (let i = 0; i < prices.length; i++) {
      const at = first + i;
      if (at % dayStep !== 0) continue;
      const xd = x(i);
      ctx.beginPath();
      ctx.moveTo(xd, 0);
      ctx.lineTo(xd, h + pane);
      ctx.stroke();
      // Marathon's days are real: the weekday in Sydney that the slot's day begins (ADR 0087)
      const dayName = s.mode === "marathon" && s.slotMs ? new Date(at * s.slotMs).toLocaleDateString(getLanguage() === "en" ? "en-AU" : getLanguage(), { timeZone: "UTC", weekday: "short", day: "numeric" }) : `D${at / dayStep + 1}`;
      if (!tutorial && at >= 0 && xd < w - 110) ctx.fillText(dayName, xd + 4, h - 6);
    }
    // A day's indicator sits at its candle's centre; today's at the price.
    /** @param {number} d */
    const dayX = (d) => x(Math.min(d * k + k / 2, prices.length - 1));
    /** @param {(number | null)[]} values @param {string} colour @param {number} width */
    const line = (values, colour, width = 1.5) => {
      ctx.strokeStyle = colour;
      ctx.lineWidth = width;
      ctx.beginPath();
      let on = false;
      values.forEach((v, d) => {
        if (v === null) return void (on = false);
        if (on) ctx.lineTo(dayX(d), v);
        else ctx.moveTo(dayX(d), v);
        on = true;
      });
      ctx.stroke();
      ctx.lineWidth = 1;
    };
    for (let k = 0; k <= 4; k++) {
      const p = bottom + ((top - bottom) * k) / 4;
      ctx.beginPath();
      ctx.moveTo(0, y(p));
      ctx.lineTo(w - 70, y(p));
      ctx.stroke();
      // Grid labels that would sit under the last-price tag are skipped.
      if (Math.abs(y(p) - y(latest)) > 16) ctx.fillText(quoted(p), w - 66, Math.min(h - (pane ? 8 : 4), Math.max(14, y(p) + 4)));
    }
    // The bands, under everything that follows.
    if (shown.length) {
      ctx.fillStyle = css.getPropertyValue("--band-fill");
      ctx.beginPath();
      const at = bands.flatMap((b, d) => b ? [{ band: b, day: d }] : []);
      at.forEach(({ band: b, day: d }, i) => (i ? ctx.lineTo(dayX(d), y(b.upper)) : ctx.moveTo(dayX(d), y(b.upper))));
      at.toReversed().forEach(({ band: b, day: d }) => ctx.lineTo(dayX(d), y(b.lower)));
      ctx.fill();
      line(bands.map((b) => b && y(b.upper)), css.getPropertyValue("--band"), 1);
      line(bands.map((b) => b && y(b.lower)), css.getPropertyValue("--band"), 1);
    }
    // The entry and the stop of my own position.
    // My position's lines: the entry, the stop, and where the broker steps
    // in, the margin call and the forced losscut, worked out by the
    // server's desk. A line off the scale is listed at that edge with an
    // arrow. Labels are laid out top to bottom in their lines' order, each
    // at its line or just below the label above, so lines close together
    // (a 400× position's) never print over each other or swap places.
    /** @type {[number, string, string][]} */
    const marks = [];
    if (pos) {
      marks.push([pos.entry, pos.side === 1 ? up : down, `${pos.side === 1 ? t("long") : t("short")} ${pos.leverage}×`]);
      if (pos.stop) marks.push([pos.stop, down, t("slFull")]);
      if (pos.take) marks.push([pos.take, up, t("tpFull")]);
      if (pos.call) marks.push([pos.call, css.getPropertyValue("--call"), t("lineCall")], [pos.cut ?? 0, down, t("lineCut")]);
    }
    /** @type {{ at: number, colour: string, text: string }[]} */
    const labels = [];
    for (const [p, colour, text] of marks) {
      if (p > bottom && p < top) {
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = colour;
        ctx.beginPath();
        ctx.moveTo(0, y(p));
        ctx.lineTo(w - 70, y(p));
        ctx.stroke();
        ctx.setLineDash([]);
        labels.push({ at: y(p) - 4, colour, text });
      } else labels.push({ at: p >= top ? 0 : h, colour, text: `${p >= top ? "▲" : "▼"} ${text} ${quoted(p)}` });
    }
    // Each label on a patch of the chart's colour, so a line that runs
    // under a pushed-down label never strikes through it.
    for (const l of stack(labels, 44, h - 4, 15)) {
      const lw = ctx.measureText(l.text).width;
      ctx.fillStyle = css.getPropertyValue("--chart");
      ctx.fillRect(w - 70 - lw - 9, l.at - 11, lw + 6, 14);
      ctx.fillStyle = l.colour;
      ctx.fillText(l.text, w - 70 - lw - 6, l.at);
    }
    // One candle a day, then the price line through today's ticks. Each is kept, its centre and its prices, for the
    // reading a pointer over the chart shows (ADR 0083).
    candlesShown = [];
    for (let d = 0; d * k < prices.length - 1; d++) {
      const day = prices.slice(d * k, d * k + k + 1);
      const open = day[0];
      const close = day.at(-1) ?? open;
      const colour = close >= open ? up : down;
      const cx = x(d * k + k / 2);
      candlesShown.push({ cx, open, high: Math.max(...day), low: Math.min(...day), close, half: (x(k) - x(0)) / 2, top: h });
      ctx.strokeStyle = colour;
      ctx.beginPath();
      ctx.moveTo(cx, y(Math.max(...day)));
      ctx.lineTo(cx, y(Math.min(...day)));
      ctx.stroke();
      ctx.fillStyle = colour;
      const bw = Math.max(3, (x(k) - x(0)) * 0.6);
      ctx.fillRect(cx - bw / 2, y(Math.max(open, close)), bw, Math.max(2, Math.abs(y(open) - y(close))));
    }
    // Moving averages over the candles, and their legend top-left.
    /** @type {[string, string][]} */
    const legend = [];
    if (studies.ma && !tutorial) {
      const fast = cut(sma(days, PERIODS.fast));
      const slow = cut(sma(days, PERIODS.slow));
      line(slow.map((v) => v && y(v)), css.getPropertyValue("--ma-slow"));
      line(fast.map((v) => v && y(v)), css.getPropertyValue("--ma-fast"));
      if (fast.at(-1)) legend.push([`MA ${spanOf(PERIODS.fast, perDay(s))} ${quoted(fast.at(-1) ?? 0)}`, css.getPropertyValue("--ma-fast")]);
      if (slow.at(-1)) legend.push([`MA ${spanOf(PERIODS.slow, perDay(s))} ${quoted(slow.at(-1) ?? 0)}`, css.getPropertyValue("--ma-slow")]);
    }
    if (shown.length) legend.push([`BB(${spanOf(PERIODS.band, perDay(s))},2)`, css.getPropertyValue("--band")]);
    // On a phone the canvas is shrunk to a third, too small for a legend.
    const small = canvas.clientWidth < 600;
    let lx = 10;
    for (const [text, colour] of small ? [] : legend) {
      ctx.fillStyle = colour;
      ctx.fillText(text, lx, HEAD - 8);
      lx += ctx.measureText(text).width + 14;
    }
    // The RSI pane: the line, the 70 and 30 bands, and today's value.
    if (pane) {
      /** @param {number} v */
      const ry = (v) => h + 8 + ((100 - v) / 100) * (pane - 16);
      ctx.strokeStyle = css.getPropertyValue("--line");
      ctx.beginPath();
      ctx.moveTo(0, h + 0.5);
      ctx.lineTo(w, h + 0.5);
      ctx.stroke();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = css.getPropertyValue("--chart-grid");
      for (const v of [30, 70]) {
        ctx.beginPath();
        ctx.moveTo(0, ry(v));
        ctx.lineTo(w - 70, ry(v));
        ctx.stroke();
        ctx.fillStyle = css.getPropertyValue("--muted");
        ctx.fillText(String(v), w - 66, ry(v) + 4);
      }
      ctx.setLineDash([]);
      const r = cut(rsi(days, PERIODS.rsi));
      line(r.map((v) => v === null ? null : ry(v)), css.getPropertyValue("--rsi"));
      const now = r.at(-1) ?? null;
      ctx.fillStyle = now === null ? css.getPropertyValue("--muted") : now >= 70 ? down : now <= 30 ? up : css.getPropertyValue("--rsi");
      if (!small) ctx.fillText(`RSI(${PERIODS.rsi}) ${now === null ? "—" : now.toFixed(1)}`, 10, h + 20);
    }
    // A face at each moment a trader opened, added to, closed or was cut out of a position
    // (ADR 0064), on the price of that tick, with an arrow for the way and a ring if it is mine.
    const pink = css.getPropertyValue("--pink");
    const muted = css.getPropertyValue("--muted");
    ctx.font = "9px 'JetBrains Mono', ui-monospace, monospace";
    for (const m of s.marks ?? []) {
      const i = prices.length - 1 - (s.tick - m.tick);
      if (i < 0 || i > prices.length - 1) continue;
      const cx = x(i);
      if (cx < 8 || cx > w - 78) continue;
      const my = Math.max(HEAD + 8, Math.min(h - 8, y(prices[i])));
      const img = faceImage(m.face);
      ctx.globalAlpha = m.you ? 1 : 0.85;
      if (img.complete && img.naturalWidth) ctx.drawImage(img, cx - 7, my - 7, 14, 14);
      ctx.globalAlpha = 1;
      if (m.you) {
        ctx.strokeStyle = pink;
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - 8, my - 8, 16, 16);
        ctx.lineWidth = 1;
      }
      // The way, beside the face: a green arrow for a buy below it, a red one for a sell above
      // it; a close or a cut is a small dot, or a cross when the broker did it, below it.
      const opened = m.kind === "open" || m.kind === "add";
      const glyph = opened ? (m.side === 1 ? "▲" : "▼") : m.kind === "stopout" || m.kind === "zerocut" ? "✕" : "●";
      ctx.fillStyle = opened ? (m.side === 1 ? up : down) : muted;
      ctx.fillText(glyph, cx - 3, opened && m.side === -1 ? my - 10 : my + 19);
    }
    // the marks' small type must not carry on to the price tag below
    ctx.font = "12px 'JetBrains Mono', ui-monospace, monospace";
    const last = latest;
    ctx.strokeStyle = css.getPropertyValue("--chart-line");
    ctx.beginPath();
    ctx.moveTo(0, y(last));
    ctx.lineTo(w - 70, y(last));
    ctx.stroke();
    ctx.fillStyle = css.getPropertyValue("--chart-line");
    ctx.fillRect(w - 70, y(last) - 9, 70, 18);
    ctx.fillStyle = css.getPropertyValue("--chart");
    ctx.fillText(quoted(last), w - 66, y(last) + 4);
  }


  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(redraw); observer.observe($("chart")); cleanup.push(() => observer.disconnect());
  } else listen(window, "resize", redraw);
  return { draw, dispose() { disposed = true; cancelAnimationFrame(frame); for (const cancel of cleanup) cancel(); for (const button of document.querySelectorAll("#studies button")) if (button instanceof HTMLButtonElement) button.onclick = null; for (const img of faces.values()) img.onload = null; faces.clear(); } };
}
