// Types for format.js, which the pages load as plain JavaScript and the
// server imports, so both write money the same way.
export declare const aud: (n: number) => string;
export declare const quoted: (p: number) => string;
export declare const tone: (n: number) => "up" | "down" | "";
export declare const locale: (lang: string) => string;
export declare const sydneyTime: (ms: number, lang: string) => string;
