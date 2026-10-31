import { expect, it } from "vitest";
import { listen } from "../spec/sse.ts";

it("reads state messages across chunks without treating named heartbeats as state", async () => {
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of ['event: heartbeat\ndata: {}\n\n', 'data: {"mode":', '"replay"}\n\nevent: heartbeat\ndata: {}\n\n', 'event: message\ndata: {"mode":"tutorial"}\n\n']) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  const stream = listen(source);
  expect(await stream.next(() => true)).toEqual({ mode: "replay" });
  expect(await stream.next(() => true)).toEqual({ mode: "tutorial" });
  expect(await stream.next(() => true)).toBeNull();
});
