import { expect, inject, it } from "vitest";

// The brief's real-time requirement, against the running app: a move one
// visitor makes reaches another visitor's open session within about a second,
// with no reload. The second visitor listens on /api/events (server-sent
// events), as the page does.
const baseUrl = inject("baseUrl");

type Magnet = { id: string; x: number; y: number };

async function visitor(): Promise<string> {
  const res = await fetch(new URL("/api/magnets", baseUrl));
  const cookie = res.headers.get("set-cookie")?.match(/v=[^;]+/)?.[0];
  if (!cookie) throw new Error("the server set no visitor cookie");
  return cookie;
}

// Resolves with the first event whose data matches, or rejects after `ms`.
async function nextEvent(
  body: ReadableStream<Uint8Array>,
  match: (data: Record<string, unknown>) => boolean,
  ms: number,
): Promise<Record<string, unknown>> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const timeout = setTimeout(() => reader.cancel(), ms);
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) throw new Error(`no matching event within ${ms}ms`);
      buffer += decoder.decode(value, { stream: true });
      let end;
      while ((end = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const line = frame.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        const data = JSON.parse(line.slice(6)) as Record<string, unknown>;
        if (match(data)) return data;
      }
    }
  } finally {
    clearTimeout(timeout);
  }
}

it("sends a move to another open session within a second", async () => {
  const mover = await visitor();
  const watcher = await visitor();
  const { magnets } = (await (await fetch(new URL("/api/magnets", baseUrl))).json()) as {
    magnets: Magnet[];
  };
  const before = magnets[5];
  const target = { x: 0.2468, y: 0.1357 };

  const controller = new AbortController();
  const stream = await fetch(new URL("/api/events", baseUrl), {
    headers: { cookie: watcher, accept: "text/event-stream" },
    signal: controller.signal,
  });
  expect(stream.status).toBe(200);
  expect(stream.headers.get("content-type")).toMatch(/^text\/event-stream/);

  try {
    const heard = nextEvent(stream.body!, (d) => d.id === before.id && d.x === target.x, 1000);
    const started = Date.now();
    const res = await fetch(new URL(`/api/magnets/${before.id}`, baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json", cookie: mover },
      body: JSON.stringify(target),
    });
    expect(res.status).toBe(200);

    // the watcher sees it moved, and sees that it isn't theirs
    expect(await heard).toMatchObject({ id: before.id, ...target, mine: false });
    expect(Date.now() - started).toBeLessThan(1000);
  } finally {
    controller.abort();
    await fetch(new URL(`/api/magnets/${before.id}`, baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ x: before.x, y: before.y }),
    });
  }
});
