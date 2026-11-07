// Process entry point. Application state, clocks and sockets belong to createApp.
import { createApp } from "./app.ts";
export { createApp } from "./app.ts";

if (import.meta.main) {
  const app = createApp();
  await app.start();
  for (const signal of ["SIGTERM", "SIGINT"] as const) process.once(signal, () => {
    void app.stop().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
  });
}
