// Pure settlement policy. Provider parsing and accounting do not live here.
import { SLOT_MS, type Currency } from "./quotes.ts";
export const SETTLED_MS = 60 * 60_000;
export type Quality = "observed" | "carried" | "pending" | "closed";
// Standard FX closures in New York time: the weekend, and 17:00 on Christmas/New Year's Eve to 17:00 the next day.
// These are calendar exemptions only when no historical bar proves the source traded in that slot.
// https://www.oanda.com/us-en/trading/hours-of-operation/
// https://www.oanda.com/us-en/trading/holiday-trading-hours/
const sessionClock = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "numeric", day: "numeric", weekday: "short", hour: "numeric", hourCycle: "h23" });
function tradingSlot(slot: number): boolean {
  const parts = sessionClock.formatToParts(new Date(slot * SLOT_MS));
  const weekday = parts.find((part) => part.type === "weekday")!.value;
  const hour = Number(parts.find((part) => part.type === "hour")!.value);
  const month = Number(parts.find((part) => part.type === "month")!.value);
  const day = Number(parts.find((part) => part.type === "day")!.value);
  const eve = month === 12 && (day === 24 || day === 31);
  const holiday = (month === 12 && day === 25) || (month === 1 && day === 1);
  if ((eve && hour >= 17) || (holiday && hour < 17)) return false;
  return weekday !== "Sat" && !(weekday === "Fri" && hour >= 17) && !(weekday === "Sun" && hour < 17);
}


// Whether the FX week is open now, Sunday 17:00 to Friday 17:00 in New York, holidays aside.
export const weekOpen = (now: number): boolean => tradingSlot(Math.floor(now / SLOT_MS));

// When the FX week next opens, by the same calendar, as a time in ms; null while it trades. The page names it when Live
// is shut for the weekend or a holiday, so a closed market says when it comes back.
export function nextOpen(now: number): number | null {
  const first = Math.floor(now / SLOT_MS);
  if (tradingSlot(first)) return null;
  // at most a week and a holiday of slots ahead
  for (let slot = first + 1; slot <= first + 4 * 96 * 2; slot++) if (tradingSlot(slot)) return slot * SLOT_MS;
  return null;
}

export function slotQuality(slot: number, required: readonly Currency[], observed: ReadonlySet<Currency> | undefined, traded: boolean, now: number): Quality {
  if (required.every((cur) => cur === "USD" || observed?.has(cur))) return "observed";
  if (!traded && !tradingSlot(slot)) return "closed";
  // A hole is carried from the price before it at once. Waiting an hour for the provider to send a bar it often never
  // sends paused Live for everyone, and a stop-out settled on the carried price instead is no loss in a play-money game
  // (ADR 0097). "pending" is no longer produced; the type keeps it so saved diagnostics and older callers still read.
  void now;
  return "carried";
}
