// Types for indicators.js, which the page and the checks share.
export declare function closes(prices: number[], steps: number): number[];
export declare function sma(values: number[], n: number): (number | null)[];
export declare function bollinger(values: number[], n: number, k: number): ({ mid: number; upper: number; lower: number } | null)[];
export declare function rsi(values: number[], n: number): (number | null)[];
