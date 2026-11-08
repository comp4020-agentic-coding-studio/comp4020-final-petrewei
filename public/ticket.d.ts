// Types for ticket.js, which the page and the checks share.
export declare const SHARES: number[];
export declare function pipOf(pair: string): number;
export declare function shareMargin(equity: number, used: number, share: number): number;
export declare function shareBar(equity: number, used: number, share: number): { used: number; order: number; cut: boolean };
export declare function levPos(lev: number, ladder: number[]): number;
export declare function levAt(pos: number, ladder: number[]): number;
export declare function pct(change: number): string;
export declare function gauge(worth: number): number;
export declare function distPos(d: number, ladder: number[]): number;
export declare function distAt(pos: number, ladder: number[]): number;
export declare function exitPos(e: { kind: "sl" | "tp"; dist: number }, ladder: number[]): number;
export declare function exitAt(pos: number, ladder: number[]): { kind: "sl" | "tp"; dist: number };
export declare function fillSpan(kind: "sl" | "tp", value: number, min: number, max: number): { from: number; to: number };
export declare function movePerPct(margin: number, leverage: number, pct?: number): number;
export declare function feePerMinute(fee: number, leverage: number, ticksPerMinute: number): string;
export declare function levHeat(leverage: number, cap: number, top: number): number;
export declare const hue: (heat: number) => string;
export declare function verdict(how: "close" | "stop" | "take" | "stopout" | "zerocut", pct: number): "wiped" | "cut" | "big" | "small" | "flat" | "win" | "huge";
