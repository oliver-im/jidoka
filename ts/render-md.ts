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
      const reviews = overviewReviewsCell(unit.review);
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
  const preReviewBlock = renderPreReviewBlock(plan.pre_review);
  const gitWorkflowBlock = renderGitWorkflowBlock(
    dirName,
    plan.git_workflow ?? false,
  );
  const planReviewBlock = renderPlanReviewBlock(plan.plan_review);
  return eta.render("progress.md.eta", {
    dirName,
    cursor,
    preReviewBlock,
    gitWorkflowBlock,
    planReviewBlock,
  });
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

  const reviewItems = renderPipelineChecklist(unit.review);

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

function renderPipelineChecklist(commands: string[] | undefined): string {
  if (commands === undefined || commands.length === 0) {
    return "- [ ] _No review steps configured._\n";
  }
  return commands.map((c) => `- [ ] \`${c}\``).join("\n") + "\n";
}

function renderPreReviewBlock(commands: string[] | undefined): string {
  let out = "## Pre-execution review\n\n";
  if (commands === undefined || commands.length === 0) {
    out +=
      "_No pre-execution review configured. Proceed to the cursor unit._\n";
    return out;
  }
  out +=
    "Before starting the first unit, run these against the freshly materialized plan dir:\n\n";
  out += renderPipelineChecklist(commands);
  return out;
}

/**
 * The `## Git workflow` reminder, rendered into `progress.md` only when the
 * `git_workflow` flag is on (config or `.planview.json`). Terse on purpose —
 * the full version lives in `docs/exec-plans/AGENTS.md` + `docs/CONVENTION.md`.
 * Returns "" when off (no empty section), and a block ending in a blank line
 * when on, so the template slot collapses cleanly either way.
 */
function renderGitWorkflowBlock(planId: string, enabled: boolean): string {
  if (!enabled) return "";
  return (
    "## Git workflow\n\n" +
    "This plan is worked in its own git worktree, one branch per unit. " +
    "Full steps: `docs/exec-plans/AGENTS.md` + `docs/CONVENTION.md`.\n\n" +
    `- **Worktree:** \`worktrees/${planId}/\` on branch \`plan/${planId}\` ` +
    "(off `main`); the plan's `active/` dir lives only inside it.\n" +
    "- **Per unit:** branch `unit/NN-slug` off the plan branch → work + review → " +
    "`git merge --squash unit/NN-slug` into the plan branch as one " +
    "`Unit NN: <title>` commit → `git branch -D unit/NN-slug` → advance the cursor.\n" +
    "- **At the end:** `git mv` the plan dir `active/ → completed/` (+ provenance " +
    `stamp), commit, then \`git checkout main && git merge --no-ff plan/${planId}\`, ` +
    `\`git worktree remove worktrees/${planId}\`.\n` +
    "\n"
  );
}

function renderPlanReviewBlock(commands: string[] | undefined): string {
  let out = "## Plan-level review\n\n";
  if (commands === undefined || commands.length === 0) {
    out +=
      "_No plan-level reviews configured. After the last unit, surface a summary and ask the user before archiving._\n";
    return out;
  }
  out +=
    "After the last unit's review lands and is committed, run these against the cumulative plan diff:\n\n";
  out += renderPipelineChecklist(commands);
  return out;
}

function overviewReviewsCell(commands: string[] | undefined): string {
  if (commands === undefined || commands.length === 0) return "—";
  return commands.join(" + ");
}

function unitTopologyBlock(topology: Topology): string {
  return mermaid(topology)
    .map((g) => `\`\`\`mermaid\n${g}\n\`\`\``)
    .join("\n\n");
}
