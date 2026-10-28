// Types for ticket.js, which the page and the checks share.
export declare const STAKES: number[];
export declare function levPos(lev: number, ladder: number[]): number;
export declare function levAt(pos: number, ladder: number[]): number;
export declare function pct(change: number): string;
export declare function gauge(worth: number): number;
export declare const DISTANCES: number[];
export declare function distPos(d: number): number;
export declare function distAt(pos: number): number;
export declare function exitPos(e: { kind: "sl" | "tp"; dist: number }): number;
export declare function exitAt(pos: number): { kind: "sl" | "tp"; dist: number };
export declare function fillSpan(kind: "sl" | "tp", value: number, min: number, max: number): { from: number; to: number };
export declare function moveYen(margin: number, leverage: number, pct: number): number;
