import { inject } from "vitest";
import { type Listener, listen } from "./sse.ts";

// Shared by every spec file: where the app is, who a visitor is, and how to
// read and change the door.
export const baseUrl = inject("baseUrl");

// True when the checks run against the deployed app. Real visitors share that
// door, so a test's move, hold, theft notice or poem would land on them. The
// write helpers below throw there, so a test that changes the door has to skip
// the live run (`it.skipIf(live)`) rather than forget to. CI and local runs
// use a throwaway copy, where every test runs.
export const live = new URL(baseUrl).hostname.endsWith(".fly.dev");

export type Magnet = { id: string; text: string; x: number; y: number; mine: boolean; held: boolean; v: number };

const url = (path: string): URL => new URL(path, baseUrl);
const send = (path: string, cookie?: string, body?: unknown): Promise<Response> =>
  fetch(url(path), {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

// A cookie jar of one: each visitor is the v= cookie the server hands out.
export async function visitor(): Promise<string> {
  const res = await fetch(url("/api/magnets"));
  const cookie = res.headers.get("set-cookie")?.match(/v=[^;]+/)?.[0];
  if (!cookie) throw new Error("the server set no visitor cookie");
  return cookie;
}

export const get = async <T>(path: string, cookie?: string): Promise<T> =>
  (await fetch(url(path), { headers: cookie ? { cookie } : {} })).json() as Promise<T>;

export const magnets = async (cookie?: string): Promise<Magnet[]> =>
  (await get<{ magnets: Magnet[] }>("/api/magnets", cookie)).magnets;

export async function word(text: string, cookie?: string): Promise<Magnet> {
  const found = (await magnets(cookie)).find((m) => m.text === text);
  if (!found) throw new Error(`no magnet "${text}"`);
  return found;
}

// Changes the door, so never against the live one.
export function post(path: string, cookie?: string, body?: unknown): Promise<Response> {
  if (live) throw new Error(`a test changed the live door (${path}); skip it there with it.skipIf(live)`);
  return send(path, cookie, body);
}

export const move = (id: string, at: { x: number; y: number }, cookie?: string): Promise<Response> =>
  post(`/api/magnets/${id}`, cookie, at);

// A request the server must refuse changes nothing, so it may run anywhere.
export const attempt = (path: string, body: unknown, cookie?: string): Promise<Response> => send(path, cookie, body);

// An open page: the visitor's event stream, read with next(), until close().
export async function page(cookie?: string): Promise<{ res: Response; next: Listener["next"]; close: () => void }> {
  const controller = new AbortController();
  const res = await fetch(url("/api/events"), { headers: cookie ? { cookie } : {}, signal: controller.signal });
  return { res, next: listen(res.body!).next, close: () => controller.abort() };
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
