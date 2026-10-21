import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { baseUrl } from "./helpers.ts";

// The optional background music (ADR 0020). The track is served as the
// file's exact bytes, in ranges, so playback starts before the whole
// file arrives and a browser can seek; a page never fetches it until a
// player turns music on. Read-only, so these run live too.
const url = new URL("/audio/bgm.m4a", baseUrl);

it("serves the track as audio, byte for byte", async () => {
  const res = await fetch(url);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("audio/mp4");
  expect(res.headers.get("accept-ranges")).toBe("bytes");
  const body = new Uint8Array(await res.arrayBuffer());
  // a valid MP4 file starts with its ftyp box
  expect(new TextDecoder().decode(body.slice(4, 8))).toBe("ftyp");
  if (!baseUrl.includes("fly.dev")) expect(body.length).toBe(readFileSync("public/audio/bgm.m4a").length);
});

it("serves a range, so playback starts and seeks without the whole file", async () => {
  const total = Number((await fetch(url, { method: "HEAD" })).headers.get("content-length"));
  expect(total).toBeGreaterThan(1000);
  const res = await fetch(url, { headers: { range: "bytes=100-199" } });
  expect(res.status).toBe(206);
  expect(res.headers.get("content-range")).toBe(`bytes 100-199/${total}`);
  expect((await res.arrayBuffer()).byteLength).toBe(100);
  // an open-ended range runs to the end
  const tail = await fetch(url, { headers: { range: `bytes=${total - 10}-` } });
  expect(tail.status).toBe(206);
  expect((await tail.arrayBuffer()).byteLength).toBe(10);
  // a range past the end is refused
  expect((await fetch(url, { headers: { range: `bytes=${total}-` } })).status).toBe(416);
});

it("offers a music switch that starts off and never loads the track by itself", async () => {
  const html = await (await fetch(new URL("/", baseUrl))).text();
  expect(html).toMatch(/<button[^>]*id="music"[^>]*aria-pressed="false"/);
  expect(html).toMatch(/<audio[^>]*id="bgm"[^>]*preload="none"/);
  expect(html).not.toMatch(/<audio[^>]*autoplay/);
});

it("serves nothing else from the audio folder, and no path tricks", async () => {
  for (const path of ["/audio/other.m4a", "/audio/../package.json", "/audio/%2e%2e/package.json", "/audio/"]) {
    expect((await fetch(new URL(path, baseUrl))).status, path).toBe(404);
  }
});
