// Types for about.js, which the server renders into the About pages.
type About = { title: string; lead: string; sections: [string, string[]][]; readme: string; back: string };
export declare const ABOUT: Record<"en" | "ja" | "zh", About>;
