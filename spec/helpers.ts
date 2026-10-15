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

export type Trader = { id: string; name: string; bot: boolean; motto?: string; equity: number; side: number; leverage: number; out: boolean; you: boolean };
export type Mode = "history" | "live" | "tutorial";
export type State = {
  mode: Mode;
  here: Record<Mode, number>;
  simulated: boolean;
  phase: "trade" | "break";
  start: number;
  round: number;
  pair: string;
  tick: number;
  total: number;
  from: number;
  prices: number[];
  you: { name: string; balance: number; equity: number; out: boolean; broke: boolean; debt: number; cuts: number; pos: { side: number; entry: number; leverage: number; margin: number; stop: number | null } | null };
  traders: Trader[];
  career: { name: string; rounds: number; profit: number; wins: number; busts: number; you: boolean }[];
  feed: { text: string; kind: string }[];
};

// The requests a visitor makes, against any server: the app under test
// here, or a test's own server in test/ (`client(s.base)`).
export function client(base: string, guard = false) {
  const url = (path: string): URL => new URL(path, base);
  const send = (path: string, cookie?: string, body?: unknown): Promise<Response> =>
    fetch(url(path), {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const state = async (cookie?: string, mode: Mode = "history"): Promise<State> =>
    (await fetch(url(`/api/state?mode=${mode}`), { headers: cookie ? { cookie } : {} })).json() as Promise<State>;
  return {
    // A cookie jar of one: each visitor is the v= cookie the server hands out.
    async visitor(): Promise<string> {
      const res = await fetch(url("/api/state"));
      const cookie = res.headers.get("set-cookie")?.match(/v=[^;]+/)?.[0];
      if (!cookie) throw new Error("the server set no visitor cookie");
      return cookie;
    },
    state,
    // Trades on the shared market, so never against the live one.
    act(cookie: string, body: Record<string, unknown>): Promise<Response> {
      if (guard) throw new Error(`a test traded on the live market (${JSON.stringify(body)}); skip it there with it.skipIf(live)`);
      return send("/api/act", cookie, body);
    },
    // A request the server must refuse changes nothing, so it may run anywhere.
    attempt: (body: unknown, cookie?: string): Promise<Response> => send("/api/act", cookie, body),
    // Waits until the market is open with at least `ticks` of trading left,
    // so a test's orders don't land in the break between rounds.
    async open(ticks = 8, mode: Mode = "history"): Promise<void> {
      for (let i = 0; i < 400; i++) {
        const s = await state(undefined, mode);
        if (s.phase === "trade" && s.total - s.tick > ticks) return;
        await sleep(50);
      }
      throw new Error("the market never opened");
    },
    // An open page: the visitor's event stream, read with next(), until close().
    async page(cookie?: string, mode: Mode = "history"): Promise<{ res: Response; next: Listener["next"]; close: () => void }> {
      const controller = new AbortController();
      const res = await fetch(url(`/api/events?mode=${mode}`), { headers: cookie ? { cookie } : {}, signal: controller.signal });
      return { res, next: listen(res.body!).next, close: () => controller.abort() };
    },
  };
}

export const { visitor, state, act, attempt, open, page } = client(baseUrl, live);

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
