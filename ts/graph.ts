import type { Agent } from "./types.js";

export interface StepPlan {
  steps: Map<number, Agent[]>;
}

export function assignSteps(agents: Agent[]): Map<string, number> {
  const byId = new Map(agents.map((a) => [a.id, a]));
  const depths = new Map<string, number>();

  const getDepth = (id: string): number => {
    const cached = depths.get(id);
    if (cached !== undefined) return cached;

    const agent = byId.get(id)!;
    const depth =
      agent.blocked_by.length === 0
        ? 1
        : Math.max(...agent.blocked_by.map(getDepth)) + 1;

    depths.set(id, depth);
    return depth;
  };

  for (const agent of agents) {
    getDepth(agent.id);
  }
  return depths;
}

export function groupByStep(agents: Agent[]): StepPlan {
  const stepMap = assignSteps(agents);
  const buckets = new Map<number, Agent[]>();
  for (const agent of agents) {
    const step = stepMap.get(agent.id)!;
    const bucket = buckets.get(step);
    if (bucket) bucket.push(agent);
    else buckets.set(step, [agent]);
  }
  // Match Rust's BTreeMap key-sorted iteration order.
  const steps = new Map(
    [...buckets.entries()].sort(([a], [b]) => a - b),
  );
  return { steps };
}

export function stepCount(plan: StepPlan): number {
  return plan.steps.size;
}

export function isMultiStep(plan: StepPlan): boolean {
  return plan.steps.size > 1;
}

export function allAgents(plan: StepPlan): Agent[] {
  return [...plan.steps.values()].flat();
}
