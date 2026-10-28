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
export function met(step, index, { choice, looked }) {
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
