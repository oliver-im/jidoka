import { groupByStep } from "./graph.js";
import type { Agent, Topology } from "./types.js";

export function mermaid(topology: Topology): string[] {
  return topology.execution_mode === "subagents"
    ? generateSubagents(topology)
    : generateTeam(topology);
}

function generateSubagents(topology: Topology): string[] {
  const plan = groupByStep(topology.agents);
  const graphs: string[] = [];

  for (const [, agents] of plan.steps) {
    const lines: string[] = ["graph TD", emitClassDefs(), mainNodeDef()];
    const nodes: string[] = [];
    const edges: string[] = [];

    for (const agent of agents) {
      renderAgentTree(agent, nodes, edges);
      edges.push(`    main --> ${escapeId(agent.id)}`);
    }

    lines.push(...nodes, ...edges);
    graphs.push(lines.join("\n"));
  }

  return graphs;
}

function generateTeam(topology: Topology): string[] {
  const lines: string[] = ["graph TD", emitClassDefs(), mainNodeDef()];
  const nodes: string[] = [];
  const edges: string[] = [];

  nodes.push('    subgraph team["team"]');
  for (const agent of topology.agents) {
    renderAgentTree(agent, nodes, edges);
  }
  nodes.push("    end");

  for (const agent of topology.agents) {
    if (agent.blocked_by.length === 0) {
      edges.push(`    main --> ${escapeId(agent.id)}`);
    }
  }

  for (const agent of topology.agents) {
    for (const blocker of agent.blocked_by) {
      edges.push(`    ${escapeId(blocker)} --> ${escapeId(agent.id)}`);
    }
  }

  lines.push(...nodes, ...edges);
  return [lines.join("\n")];
}

function renderAgentTree(
  agent: Agent,
  nodes: string[],
  edges: string[],
): void {
  nodes.push(nodeDef(agent));

  if (agent.agents === undefined) return;

  const isTeam = agent.execution_mode === "team";

  if (isTeam) {
    nodes.push(
      `    subgraph ${escapeId(agent.id)}_team["${agent.id} team"]`,
    );
  }

  for (const child of agent.agents) {
    renderAgentTree(child, nodes, edges);
  }

  if (isTeam) {
    nodes.push("    end");
  }

  for (const child of agent.agents) {
    if (child.blocked_by.length === 0) {
      edges.push(`    ${escapeId(agent.id)} --> ${escapeId(child.id)}`);
    }
    for (const blocker of child.blocked_by) {
      edges.push(`    ${escapeId(blocker)} --> ${escapeId(child.id)}`);
    }
  }
}

export function escapeId(id: string): string {
  return id.replaceAll("-", "_");
}

function nodeDef(agent: Agent): string {
  const esc = escapeId(agent.id);
  const cls = agent.model;
  const label = `${agent.id} (${cls})`;
  return agent.output.kind === "inline"
    ? `    ${esc}["${label}"]:::${cls}`
    : `    ${esc}(["${label}"]):::${cls}`;
}

function mainNodeDef(): string {
  return '    main(("main agent")):::main';
}

function emitClassDefs(): string {
  return [
    "    classDef haiku fill:#dbeafe,stroke:#3b82f6,color:#1e3a5f",
    "    classDef sonnet fill:#dcfce7,stroke:#22c55e,color:#14532d",
    "    classDef opus fill:#ede9fe,stroke:#8b5cf6,color:#3b0764",
    "    classDef main fill:#fef3c7,stroke:#f59e0b,color:#78350f",
  ].join("\n");
}
