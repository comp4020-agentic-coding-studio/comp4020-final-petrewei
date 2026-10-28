// Types for view.js, which the page and the checks share.
export type Shown = { prices: number[]; steps: number; total: number; history?: number[]; all?: number[]; skip?: number };
export declare function windowed<T extends { prices: number[]; steps: number; total: number; history?: number[] }>(state: T): T & Shown;
export declare function place(state: Shown, i: number): number;
