import { PEOPLE } from "../public/avatars.js";
import { GIVEN } from "../public/names.js";
import { FEATS } from "./feats.ts";
import { PAIRS } from "./market.ts";
import { finite, numericFields, record, valuesMatch } from "./storage.ts";

const nullableNumber = (v: unknown): boolean => v === null || finite(v);
const optional = (v: unknown, check: (v: unknown) => boolean): boolean => v === undefined || check(v);
const string = (v: unknown): boolean => typeof v === "string";
const numbers = (v: unknown): boolean => Array.isArray(v) && v.every(finite);
export const namesValid = (v: unknown): boolean => valuesMatch(v, (name) => typeof name === "string" || (Number.isInteger(name) && Number(name) >= 0 && Number(name) < GIVEN.length));
export const migrateNames = (v: unknown): unknown => record(v) ? Object.fromEntries(Object.entries(v).map(([key, name]) => [key, Array.isArray(name) ? name[1] : name])) : v;
export const facesValid = (v: unknown): boolean => valuesMatch(v, (face) => typeof face === "string" && /^p(0|[1-9]\d*)$/.test(face) && Number(face.slice(1)) < PEOPLE.length);
export const careerValid = (v: unknown): boolean => valuesMatch(v, (c) => record(c) && string(c.name)
  && numericFields(c, ["rounds", "profit", "wins", "busts", "best"])
  && optional(c.points, finite) && optional(c.draw, nullableNumber) && optional(c.recent, numbers)
  && optional(c.feats, (feats) => Array.isArray(feats) && feats.every((feat) => FEATS.some((known) => known === feat))));

const positionValid = (v: unknown): boolean => record(v) && (v.side === 1 || v.side === -1)
  && numericFields(v, ["units", "entry", "margin", "leverage", "fees", "opened"]) && nullableNumber(v.stop) && nullableNumber(v.take);
const tradeValid = (v: unknown): boolean => record(v) && PAIRS.some((pair) => pair === v.pair) && (v.side === 1 || v.side === -1)
  && ["close", "stop", "take", "stopout"].includes(String(v.how)) && numericFields(v, ["leverage", "entry", "exit", "pnl", "pct", "at"]);
const accountValid = (v: unknown): boolean => record(v) && numericFields(v, ["balance", "debt", "interest", "cuts", "opened", "peak", "slot"])
  && typeof v.called === "boolean" && PAIRS.some((pair) => pair === v.pair)
  && record(v.positions) && Object.entries(v.positions).every(([pair, pos]) => PAIRS.some((known) => known === pair) && positionValid(pos))
  && Array.isArray(v.trades) && v.trades.every(tradeValid);
const runValid = (v: unknown): boolean => record(v) && ["key", "name", "face"].every((key) => string(v[key]))
  && nullableNumber(v.draw) && numericFields(v, ["opened", "ended", "peak", "worth"]) && (v.how === "bankrupt" || v.how === "running");
export const marathonValid = (v: unknown): boolean => record(v) && valuesMatch(v.accounts, accountValid)
  && Array.isArray(v.runs) && v.runs.every(runValid) && valuesMatch(v.waits, finite) && finite(v.slot)
  && optional(v.names, (names) => valuesMatch(names, (entry) => Array.isArray(entry) && entry.length === 2 && string(entry[0]) && nullableNumber(entry[1])));
export const migrateMarathon = (v: unknown): unknown => record(v) ? { ...v, runs: v.runs ?? [], waits: v.waits ?? {}, slot: v.slot ?? 0 } : v;
