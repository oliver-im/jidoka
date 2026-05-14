import { Eta } from "eta";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mermaid } from "./mermaid.js";
import type {
  Plan,
  ResolvedReviewPipeline,
  Topology,
  Unit,
} from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
const templatesDir = join(here, "..", "templates");
const eta = new Eta({ views: templatesDir, autoEscape: false, cache: false });

export function unitIdPrefix(id: string): string | undefined {
  if (id.length < 3) return undefined;
  if (
    id.charCodeAt(0) >= 48 &&
    id.charCodeAt(0) <= 57 &&
    id.charCodeAt(1) >= 48 &&
    id.charCodeAt(1) <= 57 &&
    id.charAt(2) === "-"
  ) {
    return id.slice(0, 2);
  }
  return undefined;
}

export function buildOverviewMd(plan: Plan, dirName: string): string {
  const goal = plan.task_summary.endsWith(".")
    ? plan.task_summary
    : plan.task_summary + ".";

  const unitRows = plan.units
    .map((unit) => {
      const prefix = unitIdPrefix(unit.id) ?? unit.id;
      const blockedBy =
        unit.blocked_by.length === 0
          ? "—"
          : unit.blocked_by.map((b) => unitIdPrefix(b) ?? b).join(", ");
      const reviews = overviewReviewsCell(unit.review_pipeline);
      return `| ${prefix} | ${unit.title} | ${blockedBy} | ${reviews} |`;
    })
    .join("\n");

  return eta.render("overview.md.eta", {
    dirName,
    taskSummary: plan.task_summary,
    goal,
    unitRows,
  });
}

export function buildProgressMd(plan: Plan, dirName: string): string {
  const cursor = plan.units[0]?.id ?? "(no units)";
  const planReviewBlock = renderPlanReviewBlock(plan.plan_review_pipeline);
  return eta.render("progress.md.eta", { dirName, cursor, planReviewBlock });
}

export function buildUnitMd(unit: Unit): string {
  const prefix = unitIdPrefix(unit.id) ?? unit.id;
  const blockedBy =
    unit.blocked_by.length === 0 ? "none" : unit.blocked_by.join(", ");
  const agents =
    unit.agents_involved && unit.agents_involved.length > 0
      ? unit.agents_involved.join(", ")
      : "main only";
  const topologyLabel = unit.topology !== undefined ? "present" : "none";

  let summaryBlock = unit.summary;
  if (summaryBlock.length > 0 && !summaryBlock.endsWith("\n")) {
    summaryBlock += "\n";
  }
  summaryBlock += "\n";

  let bodyBlock = "";
  if (unit.body_markdown.length > 0) {
    bodyBlock = unit.body_markdown;
    if (!bodyBlock.endsWith("\n")) bodyBlock += "\n";
    bodyBlock += "\n";
  }

  const topologyBlock =
    unit.topology !== undefined ? unitTopologyBlock(unit.topology) + "\n\n" : "";

  const reviewItems = renderPipelineChecklist(unit.review_pipeline);

  return eta.render("unit.md.eta", {
    prefix,
    title: unit.title,
    blockedBy,
    agents,
    topologyLabel,
    summaryBlock,
    bodyBlock,
    topologyBlock,
    reviewItems,
  });
}

function renderPipelineChecklist(
  pipeline: ResolvedReviewPipeline | undefined,
): string {
  if (pipeline === undefined || pipeline.steps.length === 0) {
    return "- [ ] _No review steps configured._\n";
  }
  const lines: string[] = [];
  for (const step of pipeline.steps) {
    lines.push(`- [ ] \`${step.primary}\``);
    if (step.note !== undefined && step.note.length > 0) {
      lines.push(`  - _${step.note}_`);
    }
    if (step.fallback !== undefined) {
      lines.push(`  - Fallback: \`${step.fallback}\``);
    }
  }
  return lines.join("\n") + "\n";
}

function renderPlanReviewBlock(
  pipeline: ResolvedReviewPipeline | undefined,
): string {
  let out = "## Plan-level review\n\n";
  if (pipeline === undefined || pipeline.steps.length === 0) {
    out +=
      "_No plan-level reviews configured. After the last unit, surface a summary and ask the user before archiving._\n";
    return out;
  }
  out +=
    "After the last unit's review lands and is committed, run these against the cumulative plan diff:\n\n";
  out += renderPipelineChecklist(pipeline);
  return out;
}

function overviewReviewsCell(
  pipeline: ResolvedReviewPipeline | undefined,
): string {
  if (pipeline === undefined || pipeline.steps.length === 0) return "—";
  return pipeline.steps.map((s) => s.primary).join(" + ");
}

function unitTopologyBlock(topology: Topology): string {
  return mermaid(topology)
    .map((g) => `\`\`\`mermaid\n${g}\n\`\`\``)
    .join("\n\n");
}
