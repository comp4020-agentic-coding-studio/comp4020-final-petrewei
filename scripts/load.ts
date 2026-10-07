#!/usr/bin/env node
// A room's worth of visitors on one door, for the showcase question: does the
// app keep up? Each visitor keeps the event stream open and moves a random
// word every couple of seconds. Reports how long a move takes to answer and
// how long it takes to reach everyone else.
//
//   node scripts/load.ts [visitors=30] [seconds=30]
//
// APP_URL picks the server (default http://localhost:8080). Never point this
// at the live door: it moves real people's words and floods the log.
const base = process.env.APP_URL ?? "http://localhost:8080";
if (new URL(base).hostname.endsWith(".fly.dev")) throw new Error("not against the live door");
const visitors = Number(process.argv[2] ?? 30);
const seconds = Number(process.argv[3] ?? 30);

type Magnet = { id: string; x: number; y: number };
const { magnets } = (await (await fetch(`${base}/api/magnets`)).json()) as { magnets: Magnet[] };

const answered: number[] = [];
const reached: number[] = [];
let refused = 0;
let failed = 0;
// When each move was sent, keyed by where it was sent to, so a listener can
// tell how long the news took.
const sent = new Map<string, number>();

async function visitor(): Promise<void> {
  const res = await fetch(`${base}/api/magnets`);
  const cookie = res.headers.get("set-cookie")!.match(/v=[^;]+/)![0];
  const stream = new AbortController();
  const events = await fetch(`${base}/api/events`, { headers: { cookie }, signal: stream.signal });
  const reader = events.body!.getReader();
  const decoder = new TextDecoder();
  (async () => {
    let buffer = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        let end;
        while ((end = buffer.indexOf("\n\n")) !== -1) {
          const line = buffer.slice(0, end).split("\n").find((l) => l.startsWith("data: "));
          buffer = buffer.slice(end + 2);
          if (!line) continue;
          const d = JSON.parse(line.slice(6));
          const at = d.type === "move" ? sent.get(`${d.id}@${d.x},${d.y}`) : undefined;
          if (at) reached.push(performance.now() - at);
        }
      }
    } catch {
      // the stream was closed at the end of the run
    }
  })();

  const until = performance.now() + seconds * 1000;
  while (performance.now() < until) {
    await new Promise((r) => setTimeout(r, 1000 + Math.random() * 2000));
    const m = magnets[Math.floor(Math.random() * magnets.length)];
    const x = +(Math.random() * 0.9).toFixed(4);
    const y = +(Math.random() * 0.9).toFixed(4);
    const t = performance.now();
    sent.set(`${m.id}@${x},${y}`, t);
    const r = await fetch(`${base}/api/magnets/${m.id}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ x, y }),
    }).catch(() => null);
    if (!r) failed++;
    else if (r.status === 409) refused++;
    else if (!r.ok) failed++;
    else answered.push(performance.now() - t);
    await r?.body?.cancel();
  }
  stream.abort();
}

const pct = (xs: number[], p: number): string =>
  xs.length ? `${[...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))].toFixed(1)}ms` : "-";

await Promise.all(Array.from({ length: visitors }, visitor));
console.log(`${visitors} visitors for ${seconds}s: ${answered.length} moves, ${refused} refused (held), ${failed} failed`);
console.log(`move answered: median ${pct(answered, 0.5)}, p95 ${pct(answered, 0.95)}, max ${pct(answered, 1)}`);
console.log(`move reached others: ${reached.length} deliveries, median ${pct(reached, 0.5)}, p95 ${pct(reached, 0.95)}, max ${pct(reached, 1)}`);
