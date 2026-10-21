// Types for avatars.js, which the server and the page share.
type Face = { colors: Record<string, string>; rows: string[] };
export declare const BOTS: Record<string, Face>;
export declare const PEOPLE: Face[];
export declare function face(id: string): Face;
export declare function svg(id: string, size?: number): string;
export declare function pixels(drawing: Face, size: number, base: Record<string, string>): string;
