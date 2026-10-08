// Reading a server-sent event stream: each `data:` line, parsed. Plain
// TypeScript with no test framework, so scripts/load.ts can use it too.
export type Event = Record<string, unknown>;

export type Listener = {
  // The first event that matches within `ms`, or null. Events that don't
  // match stay queued for a later call, as do frames that arrived together.
  next: (match: (e: Event) => boolean, ms?: number) => Promise<Event | null>;
};

// One reader and one buffer for the life of the stream. Only a closed stream
// ends it; a malformed event is an error, not an end.
export function listen(body: ReadableStream<Uint8Array>): Listener {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const queue: Event[] = [];
  let buffer = "";
  let ended = false;
  let reading: Promise<void> | null = null;

  const pull = (): Promise<void> =>
    (reading ??= reader.read().then(
      ({ value, done }) => {
        reading = null;
        if (done) {
          ended = true;
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        let end;
        while ((end = buffer.indexOf("\n\n")) !== -1) {
          const line = buffer.slice(0, end).split("\n").find((l) => l.startsWith("data: "));
          buffer = buffer.slice(end + 2);
          if (line) queue.push(JSON.parse(line.slice(6)) as Event);
        }
      },
      () => {
        reading = null;
        ended = true;
      },
    ));

  return {
    async next(match, ms = Infinity) {
      const deadline = Date.now() + ms;
      for (;;) {
        const i = queue.findIndex(match);
        if (i !== -1) return queue.splice(i, 1)[0];
        if (ended || Date.now() >= deadline) return null;
        if (ms === Infinity) await pull();
        else {
          let timer: NodeJS.Timeout | undefined;
          const late = new Promise<void>((r) => (timer = setTimeout(r, deadline - Date.now())));
          await Promise.race([pull(), late]);
          clearTimeout(timer);
        }
      }
    },
  };
}

// Every event, in order, until the stream closes.
export async function* events(body: ReadableStream<Uint8Array>): AsyncGenerator<Event> {
  const stream = listen(body);
  for (let e = await stream.next(() => true); e; e = await stream.next(() => true)) yield e;
}
