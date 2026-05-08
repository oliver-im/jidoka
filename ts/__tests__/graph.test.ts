import { describe, expect, it } from "vitest";
import { allAgents, assignSteps, groupByStep, isMultiStep, stepCount } from "../graph.js";
import type { Agent } from "../types.js";

const agent = (id: string, blockedBy: string[] = []): Agent => ({
  id,
  role: "does stuff",
  model: "sonnet",
  tools: [],
  blocked_by: blockedBy,
  background: false,
  output: { kind: "inline" },
});

describe("groupByStep", () => {
  it("single agent gets step 1", () => {
    const plan = groupByStep([agent("a")]);
    expect(stepCount(plan)).toBe(1);
    expect(plan.steps.get(1)?.length).toBe(1);
    expect(plan.steps.get(1)?.[0]?.id).toBe("a");
  });

  it("parallel agents share step 1 in order", () => {
    const plan = groupByStep([agent("a"), agent("b")]);
    expect(stepCount(plan)).toBe(1);
    expect(plan.steps.get(1)?.map((a) => a.id)).toEqual(["a", "b"]);
  });

  it("linear chain", () => {
    const plan = groupByStep([
      agent("a"),
      agent("b", ["a"]),
      agent("c", ["b"]),
    ]);
    expect(stepCount(plan)).toBe(3);
    expect(plan.steps.get(1)?.[0]?.id).toBe("a");
    expect(plan.steps.get(2)?.[0]?.id).toBe("b");
    expect(plan.steps.get(3)?.[0]?.id).toBe("c");
  });

  it("diamond", () => {
    const plan = groupByStep([
      agent("a"),
      agent("b", ["a"]),
      agent("c", ["a"]),
      agent("d", ["b", "c"]),
    ]);
    expect(stepCount(plan)).toBe(3);
    expect(plan.steps.get(1)?.length).toBe(1);
    expect(plan.steps.get(2)?.map((a) => a.id)).toEqual(["b", "c"]);
    expect(plan.steps.get(3)?.[0]?.id).toBe("d");
  });

  it("team merge scenario", () => {
    const plan = groupByStep([
      agent("frontend"),
      agent("backend"),
      agent("integrator", ["frontend", "backend"]),
    ]);
    expect(stepCount(plan)).toBe(2);
    expect(plan.steps.get(1)?.length).toBe(2);
    expect(plan.steps.get(2)?.[0]?.id).toBe("integrator");
  });

  it("preserves original array order within a step", () => {
    const plan = groupByStep([agent("z"), agent("a")]);
    expect(plan.steps.get(1)?.map((a) => a.id)).toEqual(["z", "a"]);
  });

  it("isMultiStep false for single step", () => {
    expect(isMultiStep(groupByStep([agent("a")]))).toBe(false);
  });

  it("isMultiStep true for multiple steps", () => {
    expect(isMultiStep(groupByStep([agent("a"), agent("b", ["a"])]))).toBe(
      true,
    );
  });

  it("allAgents flattens in step order", () => {
    const plan = groupByStep([
      agent("a"),
      agent("b", ["a"]),
      agent("c"),
    ]);
    expect(allAgents(plan).map((a) => a.id)).toEqual(["a", "c", "b"]);
  });
});

describe("assignSteps", () => {
  it("returns flat id->step map", () => {
    const m = assignSteps([agent("a"), agent("b", ["a"])]);
    expect(m.get("a")).toBe(1);
    expect(m.get("b")).toBe(2);
  });

  it("asymmetric merge", () => {
    const m = assignSteps([
      agent("a"),
      agent("b", ["a"]),
      agent("c"),
      agent("d", ["b", "c"]),
    ]);
    expect(m.get("a")).toBe(1);
    expect(m.get("b")).toBe(2);
    expect(m.get("c")).toBe(1);
    expect(m.get("d")).toBe(3);
  });
});
