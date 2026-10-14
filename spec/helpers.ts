import { inject } from "vitest";
import { type Listener, listen } from "./sse.ts";

// Shared by every spec file: where the app is, who a visitor is, and how to
// read and trade on the shared market.
export const baseUrl = inject("baseUrl");

// True when the checks run against the deployed app. Real people trade on
// that market, so a test's orders would land in their room and their hall
// of fame. The write helper below throws there, so a test that trades has
// to skip the live run (`it.skipIf(live)`) rather than forget to. CI and
// local runs use a throwaway copy, where every test runs.
export const live = new URL(baseUrl).hostname.endsWith(".fly.dev");

export type Trader = { id: string; name: string; bot: boolean; equity: number; side: number; leverage: number; out: boolean; you: boolean };
export type State = {
  phase: "trade" | "break";
  round: number;
  pair: string;
  tick: number;
  total: number;
  from: number;
  prices: number[];
  you: { name: string; balance: number; equity: number; out: boolean; broke: boolean; debt: number; pos: { side: number; entry: number; leverage: number; margin: number; stop: number | null } | null };
  traders: Trader[];
  feed: { text: string; kind: string }[];
};

const url = (path: string): URL => new URL(path, baseUrl);
const send = (path: string, cookie?: string, body?: unknown): Promise<Response> =>
  fetch(url(path), {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

// A cookie jar of one: each visitor is the v= cookie the server hands out.
export async function visitor(): Promise<string> {
  const res = await fetch(url("/api/state"));
  const cookie = res.headers.get("set-cookie")?.match(/v=[^;]+/)?.[0];
  if (!cookie) throw new Error("the server set no visitor cookie");
  return cookie;
}

export const state = async (cookie?: string): Promise<State> =>
  (await fetch(url("/api/state"), { headers: cookie ? { cookie } : {} })).json() as Promise<State>;

// Trades on the shared market, so never against the live one.
export function act(cookie: string, body: Record<string, unknown>): Promise<Response> {
  if (live) throw new Error(`a test traded on the live market (${JSON.stringify(body)}); skip it there with it.skipIf(live)`);
  return send("/api/act", cookie, body);
}

// A request the server must refuse changes nothing, so it may run anywhere.
export const attempt = (body: unknown, cookie?: string): Promise<Response> => send("/api/act", cookie, body);

// Waits until the market is open with at least `ms` of trading left, so a
// test's orders don't land in the break between rounds.
export async function open(ms = 3000, tickMs = Number(process.env.TICK_MS ?? 500)): Promise<void> {
  for (let i = 0; i < 400; i++) {
    const s = await state();
    if (s.phase === "trade" && (s.total - s.tick) * tickMs > ms) return;
    await sleep(100);
  }
  throw new Error("the market never opened");
}

// An open page: the visitor's event stream, read with next(), until close().
export async function page(cookie?: string): Promise<{ res: Response; next: Listener["next"]; close: () => void }> {
  const controller = new AbortController();
  const res = await fetch(url("/api/events"), { headers: cookie ? { cookie } : {}, signal: controller.signal });
  return { res, next: listen(res.body!).next, close: () => controller.abort() };
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
