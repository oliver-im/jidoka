import { Eta } from "eta";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mermaid } from "./mermaid.js";
import type { Plan, Topology, Unit } from "./types.js";

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
      const reviews =
        unit.review_steps.length === 0 ? "—" : unit.review_steps.join(" + ");
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
  return eta.render("progress.md.eta", { dirName, cursor });
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

  const reviewItems =
    unit.review_steps.length === 0
      ? "- [ ] _No review steps recorded._\n"
      : unit.review_steps.map((s) => `- [ ] ${s}`).join("\n") + "\n";

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

function unitTopologyBlock(topology: Topology): string {
  return mermaid(topology)
    .map((g) => `\`\`\`mermaid\n${g}\n\`\`\``)
    .join("\n\n");
}
