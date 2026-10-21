// Types for names.js, which the server and the page share.
type Forms = { en: string; ja: string; zh: string };
export declare const FAMILY: Forms[];
export declare const GIVEN: Forms[];
export declare function drawn(lang: "en" | "ja" | "zh", draw: [number, number]): string;
