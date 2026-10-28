// Which step of a lesson's plan to point at (ADR 0052): pure, so the page and
// the checks share it. A plan is an ordered list of steps; the player has set
// the sliders to some values and has looked at some number of the steps that
// only look, in order.
//
// A slider step is met when the slider reads its value. A step to look at
// something is met once the player has looked past it, which the page counts
// as they go: the nth look is met when `looked` is above n. A step to press is
// never met by anything the page can see, since the server moves the lesson on
// when the action is taken.
export function met(step, index, { choice, looked, stage = 0 }) {
  // A press that belongs to another stage of a lesson of several moves is
  // either done or not yet due, and not the one to point at (ADR 0057).
  if (step.stage !== undefined && step.until === "press") return step.stage !== stage;
  const m = step.until.match(/^(leverage|stake)=(\d+)$/);
  if (m) return Number(choice[m[1]]) === Number(m[2]);
  if (step.until === "look") return index < looked;
  return false;
}

// The step to point at now: the first not yet met whose control is on screen.
// `visible` says whether a step's control can be seen; a control that cannot
// is passed over, not dimmed to.
export function currentStep(plan, ctx, visible = () => true) {
  // `looked` counts looks, so a look's place is among the looks, not the plan
  let seen = 0;
  for (const step of plan) {
    const place = step.until === "look" ? seen++ : -1;
    if (!met(step, place, ctx) && visible(step)) return step;
  }
  return null;
}

// What the tutorial does for a player who has waited on a step (ADR 0054),
// from the plan alone. A step to look at only moves on. A slider step slides
// the slider to the value it asks for. A step to press sends the lesson's own
// move: a Buy or a Sell at the leverage and stake that the lesson's sliders ask
// for, the stop it teaches, or a bare Close, Borrow or Next. Nothing here can
// send a move the lesson would not accept, since the sliders it reads are the
// plan's own.
export function autoMove(step, lessonId, plan = [], choice = { leverage: 25, stake: 1 }) {
  const m = step.until.match(/^(leverage|stake)=(\d+)$/);
  if (m) return { slide: { slider: m[1], value: Number(m[2]) } };
  if (step.until === "look") return { look: true };
  if (step.until !== "press") return null;
  const asked = (what) => {
    const s = plan.find((x) => x.until.startsWith(`${what}=`));
    return s ? Number(s.until.split("=")[1]) : undefined;
  };
  if (step.target === "buy" || step.target === "sell") return { act: { kind: step.target, leverage: asked("leverage") ?? choice.leverage, stake: asked("stake") ?? choice.stake } };
  if (step.target === "stopthumb") return { act: { kind: "stop", pct: 1 } };
  if (step.target === "close") return { act: { kind: "close" } };
  if (step.target === "borrow") return { act: { kind: "borrow" } };
  return null;
}
