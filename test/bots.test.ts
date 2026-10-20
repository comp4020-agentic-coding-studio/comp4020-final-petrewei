import { describe, expect, it } from "vitest";
import { BOTS } from "../src/bots.ts";
import { Desk } from "../src/fx.ts";

// The house traders' habits have to be ones the desk lets them act out,
// or a parody is only a name.
const hana = BOTS.find((b) => b.id === "bot:kurumi")!;
const always = () => 0;

describe("Kurumi", () => {
  it("averages down on a losing position while she still has margin", () => {
    const desk = new Desk(100);
    desk.join(hana.id);
    desk.order(hana.id, 1, 25, 0.5);
    desk.mark(99);
    const action = hana.act(desk, hana.id, [100, 99], always);
    expect(action).toMatchObject({ kind: "order", side: 1 });
    const result = desk.order(hana.id, 1, (action as { leverage: number }).leverage, (action as { stake: number }).stake);
    expect(result).toMatchObject([{ kind: "add" }]);
  });

  it("prays when there is nothing left to add", () => {
    const desk = new Desk(100);
    desk.join(hana.id);
    desk.order(hana.id, 1, 100);
    desk.mark(99.6);
    expect(hana.act(desk, hana.id, [100, 99.6], always)).toEqual({ kind: "pray" });
  });

  it("borrows from Dad once she is broke", () => {
    const desk = new Desk(100);
    desk.join(hana.id);
    desk.order(hana.id, 1, 1000);
    desk.mark(90);
    expect(desk.account(hana.id).out).toBe(true);
    expect(hana.act(desk, hana.id, [100, 90], always)).toEqual({ kind: "borrow" });
  });
});
