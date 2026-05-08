import { Eta } from "eta";
import { CSS, JS, PAGE_TEMPLATE, PLAN_TEMPLATE } from "./assets.generated.js";
import { mermaid } from "./mermaid.js";
import { buildOverviewMd, unitIdPrefix } from "./render-md.js";
import type { Agent, ExecutionMode, Plan, Topology } from "./types.js";

const eta = new Eta({ autoEscape: false });

export function htmlEscape(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * JSON-encodes a string for embedding inside a `<script>` block. Beyond
 * normal JSON escaping, replaces `</` with `<\/` so the HTML tokenizer can't
 * be tricked into closing the script tag mid-payload, and escapes `<!--` for
 * older browsers.
 */
function jsonForScript(s: string): string {
  return JSON.stringify(s).replaceAll("</", "<\\/").replaceAll("<!--", "<\\!--");
}

function jsonArrayForScript(arr: string[]): string {
  return JSON.stringify(arr)
    .replaceAll("</", "<\\/")
    .replaceAll("<!--", "<\\!--");
}

export function renderTopologyHtml(
  topology: Topology,
  mermaidGraphs: string[],
  description: string,
  planMarkdown?: string,
): string {
  const hasPlan = planMarkdown !== undefined;
  const locals = {
    task_summary: htmlEscape(topology.task_summary),
    mode_label: buildModeLabel(topology),
    mermaid_graphs: mermaidGraphs,
    description: htmlEscape(description),
    has_plan: hasPlan,
    plan_markdown_json: hasPlan ? jsonForScript(planMarkdown) : "",
    phase_labels: buildPhaseLabels(topology, mermaidGraphs.length),
    css: CSS,
    js: JS,
  };
  const result = eta.renderString(PAGE_TEMPLATE, locals);
  return result;
}

interface UnitCard {
  index: number;
  anchor: string;
  prefix: string;
  title: string;
  summary: string;
  blocked_by_label: string;
  agents_label: string;
  has_topology: boolean;
  mermaid_graphs: string[];
  review_steps: string[];
}

export function renderPlanHtml(plan: Plan, dirName: string): string {
  const overviewMd = buildOverviewMd(plan, dirName);
  const unitBodies = plan.units.map((u) => u.body_markdown);
  const topologyCount = plan.units.filter((u) => u.topology !== undefined)
    .length;

  const units: UnitCard[] = plan.units.map((unit, i) => {
    const prefix = unitIdPrefix(unit.id) ?? unit.id;
    const blockedByLabel =
      unit.blocked_by.length === 0
        ? "—"
        : unit.blocked_by.map(htmlEscape).join(", ");
    const agentsLabel =
      unit.agents_involved && unit.agents_involved.length > 0
        ? unit.agents_involved.map(htmlEscape).join(", ")
        : "main only";
    const mermaidGraphs = unit.topology ? mermaid(unit.topology) : [];
    return {
      index: i,
      anchor: `unit-${htmlEscape(unit.id)}`,
      prefix,
      title: htmlEscape(unit.title),
      summary: htmlEscape(unit.summary),
      blocked_by_label: blockedByLabel,
      agents_label: agentsLabel,
      has_topology: unit.topology !== undefined,
      mermaid_graphs: mermaidGraphs,
      review_steps: unit.review_steps.map(htmlEscape),
    };
  });

  const unitCount = plan.units.length;
  const locals = {
    title: htmlEscape(plan.task_summary),
    unit_count: unitCount,
    unit_count_suffix: unitCount === 1 ? "" : "s",
    topology_count: topologyCount,
    units,
    overview_markdown_json: jsonForScript(overviewMd),
    unit_bodies_json: jsonArrayForScript(unitBodies),
    css: CSS,
    js: JS,
  };
  return eta.renderString(PLAN_TEMPLATE, locals);
}

function buildModeLabel(topology: Topology): string {
  const top: ExecutionMode = topology.execution_mode;
  const hasNestedTeam = hasNestedMode(topology.agents, "team");
  const hasNestedSubagents = hasNestedMode(topology.agents, "subagents");

  if (top === "subagents" && hasNestedTeam) return "subagents + team";
  if (top === "team" && hasNestedSubagents) return "team + subagents";
  return top;
}

function hasNestedMode(agents: Agent[], target: ExecutionMode): boolean {
  return agents.some((a) => {
    if (a.execution_mode === target) return true;
    if (a.agents) return hasNestedMode(a.agents, target);
    return false;
  });
}

function buildPhaseLabels(topology: Topology, graphCount: number): string[] {
  if (topology.execution_mode === "subagents" && graphCount > 1) {
    return Array.from({ length: graphCount }, (_, i) => `Phase ${i + 1}`);
  }
  return [];
}
