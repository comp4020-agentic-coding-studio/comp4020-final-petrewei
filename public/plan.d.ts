// Types for plan.js.
type Step = { target: string; until: string; say: string };
type Ctx = { choice: { leverage: number; stake: number }; looked: number };
export declare function met(step: Step, index: number, ctx: Ctx): boolean;
export declare function currentStep(plan: Step[], ctx: Ctx, visible?: (step: Step) => boolean): Step | null;
