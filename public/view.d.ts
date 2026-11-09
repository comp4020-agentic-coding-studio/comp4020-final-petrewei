// Types for view.js, which the page and the checks share.
export type Shown = { prices: number[]; steps: number; total: number; history?: number[]; all?: number[]; skip?: number };
export declare function windowed<T extends { prices: number[]; steps: number; total: number; history?: number[] }>(state: T): T & Shown;
export declare function place(state: Shown, i: number): number;
export declare const RANGES: Record<string, { ticks: number; candle: number } | null>;
export declare function zoomed<T extends Shown & { tick: number }>(state: T, range: string): T & Shown;
