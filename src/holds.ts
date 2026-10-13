// ADR 0002, one hand at a time: who is holding each word, and when that hold
// lapses if nothing renews it. Holds live in memory only; a restart frees
// them. Every way a hold ends except a move (which logs itself) goes through
// `ended`, and a lapse is reported before anyone else can act on the word, so
// the log never loses one. The clock is passed in so a test can step past a
// lapse without waiting for it.
export type Ended = (id: string, who: string, why: "lapse" | "release" | "drop") => void;

export class Holds {
  private readonly holds = new Map<string, { who: string; until: number }>();
  private readonly ms: number;
  private readonly now: () => number;
  private readonly ended: Ended;

  constructor({ ms, now = Date.now, ended }: { ms: number; now?: () => number; ended: Ended }) {
    this.ms = ms;
    this.now = now;
    this.ended = ended;
  }

  // Who holds the word now; a lapsed hold counts as none, even before the
  // sweep reports it.
  holder(id: string): string | null {
    const h = this.holds.get(id);
    return h && h.until >= this.now() ? h.who : null;
  }

  // Reports and removes lapsed holds: every one, or just this word's.
  sweep(id?: string): void {
    for (const [key, h] of this.holds) {
      if ((id === undefined || key === id) && h.until < this.now()) this.end(key, "lapse");
    }
  }

  // Takes or renews a hold. A long drag renews it by grabbing again.
  grab(id: string, who: string): "new" | "renewed" | "refused" {
    this.sweep(id);
    const by = this.holder(id);
    if (by !== null && by !== who) return "refused";
    this.holds.set(id, { who, until: this.now() + this.ms });
    return by === null ? "new" : "renewed";
  }

  // Lets go of a word, but only the holder's own hand can.
  release(id: string, who: string): boolean {
    this.sweep(id);
    if (this.holder(id) !== who) return false;
    this.end(id, "release");
    return true;
  }

  // The holder's last page closed: every word in their hand is let go.
  drop(who: string): void {
    for (const [id, h] of this.holds) if (h.who === who) this.end(id, "drop");
  }

  // The holder moved the word, which logs itself and ends the hold.
  moved(id: string): void {
    this.holds.delete(id);
  }

  // How many words are held now.
  get size(): number {
    return [...this.holds.keys()].filter((id) => this.holder(id) !== null).length;
  }

  private end(id: string, why: "lapse" | "release" | "drop"): void {
    const h = this.holds.get(id);
    if (!h) return;
    this.holds.delete(id);
    this.ended(id, h.who, why);
  }
}
