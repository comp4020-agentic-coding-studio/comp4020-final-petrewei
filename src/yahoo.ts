import http from "node:http";
import https from "node:https";
import type { Fetcher } from "./quotes.ts";

// Yahoo answers Fly's machine over IPv4 and times out over IPv6, where fetch may wait on it, so the request is made
// over IPv4 alone. A plain client is refused without a browser's name.
export const yahoo: Fetcher = (url) =>
  new Promise((resolve, reject) => {
    const req = (url.startsWith("https:") ? https : http).get(url, { family: 4, timeout: 8_000, headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) Losscut/1.0" } }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => (body += chunk));
      res.on("end", () => {
        if (res.statusCode !== 200) return reject(new Error(`prices ${res.statusCode}`));
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error("prices unreadable"));
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error("prices timed out")));
    req.on("error", reject);
  });
