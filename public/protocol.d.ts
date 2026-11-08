// Public wire contract. No cookies, internal identities or unrevealed rewind facts belong here.
export type Mode = "rewind" | "random" | "live" | "tutorial";
// `pnl` is this position's own result, in every mode; `you.pnl` is the account's, which in Live sums several pairs.
export type Position = { side: number; entry: number; leverage: number; margin: number; stop: number | null; take?: number | null; call?: number | null; cut?: number | null; called?: boolean; pnl?: number };
export type Trader = { id: string; name: string; draw: number | null; bot: boolean; motto?: string; equity: number; side: number; leverage: number; out: boolean; you: boolean };
export type Lesson = { id: string; moves: number; next: boolean; n: number; of: number; title: string; text: string; task: string; plan: { target: string; until: string; say: string; move?: number }[]; finished: boolean };
export type Player = { name: string; draw: number | null; named: boolean; face: string; code: string; balance: number; equity: number; pnl: number; level: number | null; out: boolean; broke: boolean; debt: number; cuts: number; pos: Position | null; used: number; guess?: number | null; credit: number; bankrupt: boolean; opened?: number | null; alerts?: { pair: string; at: number; above: boolean }[]; today?: number | null; yesterday?: { day: string; change: number; trades: number } | null; days?: number; peak?: number | null;
  // whether emergency credit can be drawn or repaid now, as the server decides it for its own market (ADR 0080)
  lending?: boolean;
  pending?: { type: string; side: number; at: number; leverage: number; share: number; sl: number | null; tp: number | null } | null;
  feats?: string[]; trades?: { side: number; leverage: number; entry: number; exit: number; how: string; pnl: number; pct: number }[];
  positions?: (Position & { pair: string; now: number; live: boolean; pnl: number })[];
};
export type Career = { name: string; draw?: number | null; rounds: number; profit: number; wins: number; busts: number; best: number; points: number; recent: number[]; feats: string[]; face: string; average: number; ranked: boolean; you: boolean };
export type WhatIf = { side: number; leverage: number; pnl: number; at: { leverage: number; pnl: number; stoppedOut: boolean }[] };
export type Debrief = { whatIf?: WhatIf | null; returnPct: number; cutPenalty: number; bankruptPenalty: number; beforeFees: number; financing: number; interest: number; balance: number; debt: number; net: number; cuts: number; bonus: number; score: number };
export type Result = { ranking: { code: string; name: string; draw: number | null; face: string; balance: number; score: number; guess: number | null; bonus: number; sat: boolean; you: boolean }[]; duels?: { a: string; b: string; winner: string | null; you: boolean }[]; reveal: string; facts: { pair: string; simulated: boolean; from: string; to: string; event: { date: string; title: string; note: string } | null; source?: string; situation?: string }; debrief: Debrief | null };
export type ClockKey = "clockDay" | "clockOpens" | "clockLobby" | "clockClosed" | "clockTutorial" | "clockLive" | "clockShut" | "clockGap" | "clockWait";
export type BankNews = { cur: string; title: string; source: string; link: string; at: number };
export type Release = { cur: string; title: string; at: number; forecast: string; previous: string; actual: string };
export type CalendarEntry = { kind: string; cur: string; d: number; h: number; outcome: string | null };
export type Headline = { situation: string; n: number } | { clue: number; n: number } | { story: number } | { release: Record<string, string | number> } | BankNews | null;
export type CommonState = {
  lesson?: Lesson; transport?: "stopped" | "paused" | "playing";
  mode: Mode; here: Record<string, number>; simulated: boolean; start: number; round: number; pair: string;
  tick: number; total: number; steps: number; dayTicks: number; from: number; history?: number[]; prices: number[];
  desk: { cap: number; fee: number; step: number; limit: number; tiers: (number | null)[][]; ticksPerMinute: number; distances: readonly number[] };
  leverages: readonly number[]; you: Player; traders: Trader[];
  career: Career[];
  feed: { text: string; kind: string; key?: string; args?: Record<string, string | number> }[];
  bid: number; ask: number; pip: number; minRounds: number;
  speed?: number; rules?: boolean; ironman?: boolean; paused?: number | null; headline?: Headline;
  calendar?: CalendarEntry[] | Release[]; bankNews?: BankNews[]; historyGap?: boolean; opens?: number | null;
  result: Result | null;
  // which clock to show, by its key in the page's words; Live adds the time of its last price (ADR 0087)
  clock: { key: ClockKey; at?: number | null };
  // how the chart draws this market: with the indicators or plain, and its days named by count (D1...), by their date
  // from a slot's length in ms, or not at all
  chart: { studies: boolean; days: "count" | "date" | "none"; slotMs?: number };
  pops: { n: number; who: string; kind: string; lev?: number; pnl?: number; way?: number }[];
  marks?: { tick: number; face: string; you: boolean; kind: string; side: number }[];
};
export type RoundState = CommonState & { duel?: { with: string } | { from: string } | null; mode: "rewind" | "random"; phase: "lobby" | "countdown" | "trade" | "break"; countdown: number; startedBy: string | null; startedCode: string | null; startedDraw: number | null | ""; breakLeft: number; rewindPlots: { n: number; pair: string }[] | null; rewindPlot: number | null; pairs: readonly string[] | null };
export type LiveState = CommonState & { mode: "live"; phase: "trade" | "shut" | "waiting"; live: boolean; priceAt: number; reopens: number | null; pairs: readonly string[]; currencies: readonly string[];
  board: { name: string; draw: number | null; face: string; opened: number; ended: number; peak: number; how: "bankrupt" | "running"; worth: number; days: string; you: boolean }[];
};
export type TutorialState = CommonState & { mode: "tutorial"; phase: "moving" | "waiting"; transport: "stopped" | "paused" | "playing"; lesson: Lesson };
export type State = RoundState | LiveState | TutorialState;
// A round's message as sent: a delta (`from` above 0) may leave out what the page already has, which the page's transport
// fills in from the last whole state, so what it renders is always a whole State.
export type Kept = "feed" | "desk" | "leverages" | "minRounds" | "pairs" | "rewindPlots";
export type Sent<S extends State> = Omit<S, Kept> & Partial<Pick<S, Extract<Kept, keyof S>>>;
export type StateFor<M extends Mode> = M extends "rewind" | "random" ? RoundState & { mode: M } : Extract<State, { mode: M }>;
export type TradeAction = { kind: "buy" | "sell"; leverage: number; share?: number; sl?: number | null; tp?: number | null } | { kind: "close" | "borrow" | "repay" } | { kind: "stop" | "take"; pct?: number | null };
export type Action =
  | ({ mode: "rewind" | "random" } & (TradeAction | { kind: "start"; ironman?: boolean } | { kind: "pause" | "resume" | "finish" | "fast" | "normal" | "cancel" | "hold" | "dismiss" } | { kind: "choose"; what: number | string } | { kind: "guess"; year: number } | { kind: "pray"; way: 1 | -1 } | { kind: "challenge" | "accept"; code: string } | { kind: "pend"; side: 1 | -1; at: number; leverage: number; share: number; sl: number | null; tp: number | null } | { kind: "unpend" }))
  | ({ mode: "live"; pair?: string } & (TradeAction | { kind: "pair"; pair: string } | { kind: "alert" | "unalert"; at: number } | { kind: "pend"; side: 1 | -1; at: number; leverage: number; share: number; sl: number | null; tp: number | null } | { kind: "unpend" }))
  | ({ mode: "tutorial" } & (TradeAction | { kind: "play" | "pause" | "stop" | "skip" | "back" | "again" | "restart" | "next" }));
