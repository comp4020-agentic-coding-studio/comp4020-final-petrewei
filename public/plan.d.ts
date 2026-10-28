// Types for plan.js.
type Step = { target: string; until: string; say: string; stage?: number };
type Ctx = { choice: { leverage: number; stake: number }; looked: number; stage?: number };
export declare function met(step: Step, index: number, ctx: Ctx): boolean;
export declare function currentStep(plan: Step[], ctx: Ctx, visible?: (step: Step) => boolean): Step | null;
type Move = { slide: { slider: "leverage" | "stake"; value: number } } | { look: true } | { act: { kind: string; leverage?: number; stake?: number; pct?: number } };
export declare function autoMove(step: Step, lessonId: string, plan?: Step[], choice?: { leverage: number; stake: number }): Move | null;
