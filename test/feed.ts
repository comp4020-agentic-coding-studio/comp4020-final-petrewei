// A fake answer from Yahoo's spark service, for the checks and the browser checks' server, which never reach the
// network: the six dollar rates Marathon reads, each with closes at `times` (seconds) and its price now struck at `at`.
// `close` may change a close, to put a crash in one slot.
export const RATES = { "EURUSD=X": 1.12, "GBPUSD=X": 1.35, "AUDUSD=X": 0.7, "CHF=X": 0.82, "CNH=X": 6.67, "JPY=X": 158 };

export function spark(at: number, times: number[], close: (symbol: string, price: number, time: number) => number = (_s, p) => p) {
  return {
    spark: {
      result: Object.entries(RATES).map(([symbol, price]) => ({
        symbol,
        response: [{ meta: { regularMarketPrice: price, regularMarketTime: at }, timestamp: times, indicators: { quote: [{ close: times.map((t) => close(symbol, price, t)) }] } }],
      })),
    },
  };
}
