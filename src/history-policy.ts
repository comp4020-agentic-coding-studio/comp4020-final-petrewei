// Pure settlement policy. Provider parsing and accounting do not live here.
import { SLOT_MS, type Currency } from "./quotes.ts";
export const SETTLED_MS = 60 * 60_000;
export type Quality = "observed" | "carried" | "pending" | "closed";
// Standard FX closures in New York time: the weekend, and 17:00 on Christmas/New Year's Eve to 17:00 the next day.
// These are calendar exemptions only when no historical bar proves the source traded in that slot.
// https://www.oanda.com/us-en/trading/hours-of-operation/
// https://www.oanda.com/us-en/trading/holiday-trading-hours/
const sessionClock = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "numeric", day: "numeric", weekday: "short", hour: "numeric", hourCycle: "h23" });
export function tradingSlot(slot: number): boolean {
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


export function slotQuality(slot: number, required: readonly Currency[], observed: ReadonlySet<Currency> | undefined, traded: boolean, now: number): Quality {
  if (required.every((cur) => cur === "USD" || observed?.has(cur))) return "observed";
  if (!traded && !tradingSlot(slot)) return "closed";
  return slot <= Math.floor((now - SETTLED_MS) / SLOT_MS) ? "carried" : "pending";
}
