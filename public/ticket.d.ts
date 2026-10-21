// Types for ticket.js, which the page and the checks share.
export declare const STAKES: number[];
export declare function levPos(lev: number): number;
export declare function levAt(pos: number, ladder: number[]): number;
export declare function pct(change: number): string;
export declare function gauge(worth: number): number;
