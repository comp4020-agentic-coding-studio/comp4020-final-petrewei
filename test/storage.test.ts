import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { JsonStore } from "../src/storage.ts";

it("migrates legacy state, versions it beside the file, and recovers a truncated primary from its last good backup", () => {
  const dir = mkdtempSync(join(tmpdir(), "losscut-storage-"));
  const file = join(dir, "state.json");
  const store = new JsonStore<{ balance: number }>(file, { initial: () => ({ balance: 100 }), validate: (v) => typeof v === "object" && v !== null && "balance" in v && typeof v.balance === "number" && Number.isFinite(v.balance) });
  try {
    writeFileSync(file, JSON.stringify({ balance: 250 }));
    expect(store.read()).toEqual({ balance: 250 });
    // the file stays the plain JSON the previous version reads, so a rollback can still load it; the version is beside it
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ balance: 250 });
    expect(readFileSync(`${file}.version`, "utf8").trim()).toBe("1");
    store.write({ balance: 300 });
    writeFileSync(file, '{"balance":');
    expect(store.read()).toEqual({ balance: 250 });
    expect(JSON.parse(readFileSync(file, "utf8")).balance).toBe(250);
    // a newer version's data is refused and left untouched
    writeFileSync(`${file}.version`, "99\n");
    writeFileSync(file, JSON.stringify({ balance: 0 }));
    expect(() => store.read()).toThrow(/Unsupported.*version/);
    expect(() => store.write({ balance: 1 })).toThrow(/Unsupported.*version/);
    expect(JSON.parse(readFileSync(file, "utf8")).balance).toBe(0);
    writeFileSync(`${file}.version`, "1\n");
    expect(() => store.write({ balance: NaN })).toThrow(/Invalid/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

it("rejects unrecoverable corruption and does not replace a valid primary when a write fails", () => {
  const dir = mkdtempSync(join(tmpdir(), "losscut-storage-failure-"));
  const file = join(dir, "state.json");
  const options = { initial: () => 1, validate: (v: unknown) => typeof v === "number" && Number.isFinite(v) };
  try {
    const store = new JsonStore<number>(file, options);
    store.write(10);
    // A directory where the temporary file must be makes the write fail on every platform, including root in CI.
    const blocker = join(dir, "state.json.tmp");
    mkdirSync(blocker);
    expect(() => store.write(20)).toThrow();
    expect(store.read()).toBe(10);
    writeFileSync(file, "broken");
    expect(() => store.read()).toThrow(/Cannot recover/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ADR 0091: Live's accounts were saved as marathon.json; they move to live.json once, with their backup and version
// marker, and a second start, or one with live.json already there, leaves everything as it is.
it("moves a renamed store once, with its backup and version marker", async () => {
  const { renameStore } = await import("../src/storage.ts");
  const dir = mkdtempSync(join(tmpdir(), "losscut-rename-"));
  const old = join(dir, "marathon.json"), next = join(dir, "live.json");
  try {
    writeFileSync(old, '{"accounts":{"k":1}}');
    writeFileSync(`${old}.bak`, '{"accounts":{}}');
    writeFileSync(`${old}.version`, "1\n");
    renameStore(old, next);
    expect(readFileSync(next, "utf8")).toBe('{"accounts":{"k":1}}');
    expect(readFileSync(`${next}.bak`, "utf8")).toBe('{"accounts":{}}');
    expect(readFileSync(`${next}.version`, "utf8")).toBe("1\n");
    expect(() => readFileSync(old)).toThrow();
    // a file left under the old name later is not moved over the new one
    writeFileSync(old, '{"accounts":{"stale":1}}');
    renameStore(old, next);
    expect(readFileSync(next, "utf8")).toBe('{"accounts":{"k":1}}');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
