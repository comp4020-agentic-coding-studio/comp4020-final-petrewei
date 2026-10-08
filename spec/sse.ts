// Reading a server-sent event stream: each `data:` line, parsed. Plain
// TypeScript with no test framework, so scripts/load.ts can use it too.
export type Event = Record<string, unknown>;

async function* frames(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<Event> {
  const decoder = new TextDecoder();
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
        if (line) yield JSON.parse(line.slice(6)) as Event;
      }
    }
  } catch {
    // the stream was closed under us, which ends it
  } finally {
    reader.releaseLock();
  }
}

export const events = (body: ReadableStream<Uint8Array>): AsyncGenerator<Event> => frames(body.getReader());

// The first event that matches within `ms`, or null. The timer cancels through
// the reader (a locked stream can't be cancelled directly), so a quiet stream
// can't hold the caller past its deadline.
export async function next(body: ReadableStream<Uint8Array>, match: (e: Event) => boolean, ms: number): Promise<Event | null> {
  const reader = body.getReader();
  const timer = setTimeout(() => reader.cancel().catch(() => {}), ms);
  try {
    for await (const e of frames(reader)) if (match(e)) return e;
    return null;
  } finally {
    clearTimeout(timer);
  }
}
