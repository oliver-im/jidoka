import { allAgents, groupByStep, isMultiStep } from "./graph.js";
import type { Agent, ExecutionMode, Topology } from "./types.js";

export function describe(topology: Topology): string {
  return render(
    topology.agents,
    topology.execution_mode,
    "the main agent",
    "",
    true,
  );
}

function render(
  agents: Agent[],
  executionMode: ExecutionMode,
  fallbackTarget: string,
  indent: string,
  showPhaseHeaders: boolean,
): string {
  const plan = groupByStep(agents);
  const multiPhase =
    showPhaseHeaders &&
    executionMode === "subagents" &&
    isMultiStep(plan);
  const flatAgents = allAgents(plan);

  const lines: string[] = [];
  let phaseNum = 0;

  for (const [, stepAgents] of plan.steps) {
    phaseNum += 1;

    if (multiPhase) {
      if (phaseNum > 1) lines.push("");
      lines.push(`${indent}Phase ${phaseNum}`);
    }

    const stepNum = multiPhase ? 1 : phaseNum;
    const parallel = stepAgents.length > 1;

    for (let i = 0; i < stepAgents.length; i++) {
      const agent = stepAgents[i]!;
      const letter = parallel ? String.fromCharCode("a".charCodeAt(0) + i) : "";

      lines.push(`${indent}${stepNum}${letter}. ${agent.id} (${agent.model})`);
      lines.push(`${indent}  tools: ${agent.tools.join(", ")}`);

      if (agent.agents !== undefined) {
        const childMode = agent.execution_mode ?? executionMode;
        const childIndent = `${indent}  `;
        const nested = render(agent.agents, childMode, agent.id, childIndent, true);
        lines.push(nested);
      }

      const produces = agent.produces ?? "";
      let context: string;
      if (agent.output.kind === "file") {
        context = `${indent}  writes "${produces}" to ${agent.output.path}`;
      } else if (executionMode === "team") {
        const deps = findDependents(agent.id, flatAgents);
        if (deps.length === 0) {
          context = `${indent}  returns "${produces}" to ${fallbackTarget}`;
        } else {
          context = `${indent}  passes "${produces}" to ${deps.join(", ")}`;
        }
      } else {
        context = `${indent}  returns "${produces}" to ${fallbackTarget}`;
      }
      lines.push(context);
    }
  }

  return lines.join("\n");
}

function findDependents(agentId: string, agents: Agent[]): string[] {
  return agents
    .filter((a) => a.blocked_by.some((b) => b === agentId))
    .map((a) => a.id);
}
