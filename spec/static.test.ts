// The page's scripts, stylesheet and icon (ADR 0093): sent gzipped to a browser that takes it, each with a tag of its
// content, so a reload that already has the file is told it is unchanged in a few bytes rather than sent it again.
// Pages themselves are written for each visit and never kept. Read-only, so these run against the live app too.
import { gunzipSync } from "node:zlib";
import { request } from "node:http";
import { request as requestTls } from "node:https";
import { expect, it } from "vitest";
import { baseUrl } from "./helpers.ts";

// fetch would unzip on its own; this asks for the raw bytes, to see what was sent
function raw(path: string, headers: Record<string, string> = {}): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: Buffer }> {
  const url = new URL(path, baseUrl);
  return new Promise((resolve, reject) => {
    const req = (url.protocol === "https:" ? requestTls : request)(url, { headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.end();
  });
}

it("sends a script gzipped, the same script as unzipped", async () => {
  const plain = await raw("/app.js");
  const zipped = await raw("/app.js", { "accept-encoding": "gzip" });
  expect(zipped.headers["content-encoding"]).toBe("gzip");
  expect(zipped.body.length).toBeLessThan(plain.body.length / 2);
  expect(gunzipSync(zipped.body).equals(plain.body)).toBe(true);
});

it("tells a reload that already has a script it is unchanged, and never keeps a page", async () => {
  const first = await raw("/i18n.js");
  const tag = first.headers.etag as string;
  expect(tag).toBeTruthy();
  const again = await raw("/i18n.js", { "if-none-match": tag });
  expect(again.status).toBe(304);
  expect(again.body.length).toBe(0);
  // a page carries the server's words and the visitor's own, so it is fetched whole every time
  const page = await raw("/");
  expect(page.headers["cache-control"]).toBe("no-store");
  expect(page.headers.etag).toBeUndefined();
});

// Every module a page imports, and every module those import, is served as a script: a module left off the server's
// list leaves a blank market while every other check passes. The tips are among them (ADR 0025).
it("serves every module the pages import, as JavaScript", async () => {
  const { readFileSync } = await import("node:fs");
  const seen = new Set<string>();
  const queue = ["app.js", "about-controls.js"];
  while (queue.length) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const [, dep] of readFileSync(`public/${file}`, "utf8").matchAll(/^\s*import[^"']*["']\.?\/([\w-]+\.js)["']/gm)) queue.push(dep);
  }
  expect(seen.has("tips.js")).toBe(true);
  for (const file of seen) {
    const res = await raw(`/${file}`);
    expect(res.status, file).toBe(200);
    expect(String(res.headers["content-type"]), file).toMatch(/javascript/);
  }
});
