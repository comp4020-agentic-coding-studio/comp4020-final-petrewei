// Types for i18n.js, which the page loads as plain JavaScript and the
// checks import.
type Table = Record<string, string>;
type Lang = {
  ui: Record<string, string> & { notes: Record<number, string> };
  tips: Table;
  info: Table;
  news: Table;
  refusals: Table;
  wants: { buy: string; sell: string; stop: string };
  bots: Record<string, { name: string; motto: string }>;
  prayers: string[];
  pops: Record<string, string>;
  lessons: Record<string, { title: string; text: string; task: string }>;
  events: Record<string, { title: string; note: string }>;
  scenarios: Record<string, { name: string; note: string; headlines: string[] }>;
  clues: Record<string, string[]>;
  lines: Record<string, Record<string, string[]>>;
};
export declare const LANGS: ("en" | "ja" | "zh")[];
export declare const T: Record<"en" | "ja" | "zh", Lang> & Record<string, Lang>;
export declare function money(lang: string, n: number): string;
export declare function news(lang: string, line: { key: string; args: Record<string, string | number>; text?: string }, nameOf: (code: string) => string): string;
export declare function refusal(lang: string, english: string): string;
export declare function english(lessons: { id: string; title: string; text: string; task: string }[], events: { date: string; title: string; note: string }[]): void;
export declare function clueDates(lang: "en" | "ja" | "zh"): string[];
export declare function clueText(lang: "en" | "ja" | "zh", clue: number, n: number): string | undefined;
