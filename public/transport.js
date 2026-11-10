// Owns the stream, generation, price buffer, gap recovery and heartbeat watchdog.
/** @param {{ onState: (state: import("./protocol.js").State) => void, onConnection: (status: string) => void, reconnect: (mode: import("./protocol.js").Mode) => void }} options */
export function createTransport({ onState, onConnection, reconnect }) {
  /** @type {EventSource | null} */
  let source = null;
  /** @type {import("./protocol.js").Mode} */
  let mode = "rewind";
  let disposed = false;
  let fresh = false;
  let heardAt = Date.now();
  /** @type {number[]} */
  let prices = [];
  /** @type {number[]} */
  let history = [];
  let round = 0;
  // What a delta leaves out, as last sent (the server resends each when it changes): the broker's fixed numbers, the
  // lists of plots and pairs, and the feed.
  /** @type {Record<string, unknown>} */
  let kept = {};
  const KEPT = ["feed", "desk", "leverages", "minRounds", "pairs", "rewindPlots"];
  /** @type {Promise<void> | null} */
  let recovery = null;
  /** @param {string} status */
  function connection(status) { fresh = status === "connectionRestored"; onConnection(status); }
  /** @param {EventSource | null} stream */
  function current(stream) { return !disposed && stream === source && navigator.onLine !== false; }
  /** @param {import("./protocol.js").State} state @param {EventSource} stream @param {boolean} [fromRecovery] */
  async function receive(state, stream, fromRecovery = false) {
    if (!current(stream) || state.mode !== mode) return;
    if (!Number.isInteger(state.from) || state.from < 0 || !Array.isArray(state.prices) || state.prices.some((price) => !Number.isFinite(price) || price <= 0)) throw new Error("Invalid price message");
    if (state.from !== 0 && !(fresh && state.round === round && state.from <= prices.length)) {
      // Only one snapshot can recover this generation. Ignore deltas while it is in flight.
      if (recovery) return recovery;
      const pending = fetch(`/api/state?mode=${mode}`).then(async (res) => {
        if (!res.ok) throw new Error("state unavailable");
        const snapshot = await res.json();
        if (recovery !== pending || !current(stream)) return;
        if (snapshot.from !== 0) throw new Error("Incomplete recovery snapshot");
        await receive(snapshot, stream, true);
      }).catch((error) => {
        if (recovery === pending && current(stream)) throw error;
      });
      recovery = pending;
      try { await pending; }
      finally { if (recovery === pending) recovery = null; }
      return;
    }
    if (recovery && state.from !== 0) return;
    if (state.from === 0) {
      // A complete stream update supersedes the HTTP recovery, even if its reply arrives later.
      if (!fromRecovery) recovery = null;
      prices = [...state.prices];
      history = state.history ?? [];
    } else {
      prices.length = state.from;
      prices.push(...state.prices);
    }
    /** @type {Record<string, unknown>} */
    const sent = state;
    for (const k of KEPT) if (sent[k] !== undefined) kept[k] = sent[k];
    state = /** @type {import("./protocol.js").State} */ ({ ...kept, ...Object.fromEntries(Object.entries(sent).filter(([, v]) => v !== undefined)) });
    round = state.round;
    heardAt = Date.now();
    if (!fresh) connection("connectionRestored");
    onState({ ...state, prices, history });
  }
  /** @param {import("./protocol.js").Mode} next */
  function start(next) {
    if (disposed) return;
    source?.close();
    mode = next; recovery = null; prices = []; history = []; round = 0; kept = {};
    connection(navigator.onLine === false ? "connectionOffline" : source ? "connectionReconnecting" : "connectionConnecting");
    heardAt = Date.now();
    const stream = source = new EventSource(`/api/events?mode=${mode}`);
    stream.onmessage = async (event) => {
      if (!current(stream)) return;
      try { await receive(JSON.parse(event.data), stream); }
      catch (error) { console.error("render failed", error); if (current(stream)) connection("connectionReconnecting"); }
    };
    stream.onerror = () => { if (stream === source) connection(navigator.onLine === false ? "connectionOffline" : "connectionReconnecting"); };
    stream.addEventListener("heartbeat", () => { if (current(stream)) heardAt = Date.now(); });
  }
  const offline = () => { source?.close(); connection("connectionOffline"); };
  const online = () => reconnect(mode);
  const watchdog = setInterval(() => { if (navigator.onLine !== false && Date.now() - heardAt > 15_000) reconnect(mode); }, 1000);
  addEventListener("offline", offline);
  addEventListener("online", online);
  return { start, suspend() { source?.close(); source = null; connection("connectionReconnecting"); }, get source() { return source; }, dispose() { disposed = true; source?.close(); source = null; clearInterval(watchdog); removeEventListener("offline", offline); removeEventListener("online", online); } };
}
