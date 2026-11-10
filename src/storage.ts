import { closeSync, copyFileSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
export const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
export const numericFields = (value: unknown, fields: readonly string[]): boolean => record(value) && fields.every((field) => finite(value[field]));
export const valuesMatch = (value: unknown, validate: (value: unknown) => boolean): boolean => record(value) && Object.values(value).every(validate);

class UnsupportedVersion extends Error {}
export type StoreOptions<T> = { initial: () => T; validate: (value: unknown) => boolean; migrateLegacy?: (value: unknown) => unknown };

export interface Store<T> { read(): T; write(data: T): void }
export interface Storage { open<T>(file: string, options: StoreOptions<T>): Store<T> }
export const jsonStorage: Storage = { open: <T>(file: string, options: StoreOptions<T>) => new JsonStore(file, options) };

// The format version this code writes. It is kept in a marker beside the file, `<file>.version`, and the file itself
// stays the plain JSON it always was, so the version before this one can still read it: a deploy can be rolled back
// without the players' accounts becoming unreadable. A file with no marker is version 0, migrated once on read.
const VERSION = 1;
const fsyncFile = (path: string): void => {
  const handle = openSync(path, "r");
  try { fsyncSync(handle); } finally { closeSync(handle); }
};

// One persisted file: validated on read and write, written atomically, with the last good copy kept as `<file>.bak`
// and used when the file itself is truncated or corrupt. A version newer than this code is refused, never overwritten.
export class JsonStore<T> {
  readonly file: string;
  private options: StoreOptions<T>;
  constructor(file: string, options: StoreOptions<T>) { this.file = file; this.options = options; }
  private version(): number {
    if (!existsSync(`${this.file}.version`)) return 0;
    const version = Number(readFileSync(`${this.file}.version`, "utf8").trim());
    if (!Number.isInteger(version) || version > VERSION) throw new UnsupportedVersion(`Unsupported storage version in ${this.file}`);
    return version;
  }
  private decode(text: string, legacy: boolean): T {
    let value: unknown = JSON.parse(text);
    if (legacy) value = this.options.migrateLegacy?.(value) ?? value;
    if (!this.options.validate(value)) throw new Error(`Invalid state in ${this.file}`);
    // This is the sole persisted-data boundary; shape validation and explicit legacy migration precede the cast.
    return value as T;
  }
  read(): T {
    if (!existsSync(this.file) && !existsSync(`${this.file}.bak`)) return this.options.initial();
    const legacy = this.version() < VERSION;
    try {
      const data = this.decode(readFileSync(this.file, "utf8"), legacy);
      if (legacy) this.write(data);
      return data;
    } catch (error) {
      try {
        const data = this.decode(readFileSync(`${this.file}.bak`, "utf8"), legacy);
        if (existsSync(this.file)) copyFileSync(this.file, `${this.file}.corrupt`);
        this.write(data);
        console.error(`Recovered ${this.file} from its backup.`);
        return data;
      } catch {
        throw new Error(`Cannot recover ${this.file}`, { cause: error });
      }
    }
  }
  write(data: T): void {
    if (!this.options.validate(data)) throw new Error(`Invalid state for ${this.file}`);
    // a newer version's file is refused before the file or its backup is touched
    const legacy = this.version() < VERSION;
    let validPrimary = false;
    if (existsSync(this.file)) {
      try { this.decode(readFileSync(this.file, "utf8"), legacy); validPrimary = true; } catch { /* a corrupt file is not backed up */ }
    }
    const temp = `${this.file}.tmp`;
    const handle = openSync(temp, "w", 0o600);
    try { writeFileSync(handle, JSON.stringify(data)); fsyncSync(handle); }
    finally { closeSync(handle); }
    if (validPrimary) {
      copyFileSync(this.file, `${this.file}.bak.tmp`);
      fsyncFile(`${this.file}.bak.tmp`);
      renameSync(`${this.file}.bak.tmp`, `${this.file}.bak`);
    }
    renameSync(temp, this.file);
    if (legacy) {
      writeFileSync(`${this.file}.version.tmp`, `${VERSION}\n`);
      fsyncFile(`${this.file}.version.tmp`);
      renameSync(`${this.file}.version.tmp`, `${this.file}.version`);
    }
    // Persist directory entries as well as file contents on the Linux production volume.
    if (process.platform !== "win32") fsyncFile(dirname(this.file));
  }
}

// Move a saved file to a new name once, with its backup and version marker (ADR 0091): only when the new file is not
// there yet, so a second start, or one after the move, changes nothing. Each rename is atomic within the volume.
export function renameStore(from: string, to: string): void {
  if (existsSync(to)) return;
  if (existsSync(`${to}.bak`)) {
    // The primary moves last. Resume when only that file is left at the old name.
    if (existsSync(from) && !existsSync(`${from}.bak`) && !existsSync(`${from}.version`)) renameSync(from, to);
    return;
  }
  if (!(existsSync(from) || existsSync(`${from}.bak`))) return;
  for (const suffix of [".version", ".bak", ""]) if (existsSync(`${from}${suffix}`)) renameSync(`${from}${suffix}`, `${to}${suffix}`);
}
