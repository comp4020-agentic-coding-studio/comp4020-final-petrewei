// Types for format.js, which the pages load as plain JavaScript and the
// server imports, so both write money the same way.
export declare const aud: (n: number) => string;
export declare const quoted: (p: number) => string;
export declare const tone: (n: number) => "up" | "down" | "";
export declare const locale: (lang: string) => string;
export declare const setZone: (zone: string) => string;
export declare const localTime: (ms: number, lang: string) => string;
export declare const feedTime: (ms: number, lang: string, now?: number) => string;
export declare const zoneName: (ms: number, lang: string) => string;
export declare const CITY_ZONES: Record<string, string>;
export declare function zoneLines(at?: number): { offset: string; value: string; cities: string[] }[];
export declare function lineOf(at: number, zone: string): string | null;
export declare const zoneNow: () => string;
