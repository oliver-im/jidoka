import { Eta } from "eta";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mermaid } from "./mermaid.js";
import { REVIEW_PLACEHOLDERS, reviewStepLabel } from "./types.js";
import type { Plan, ReviewStep, Topology, Unit } from "./types.js";

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

/**
 * GFM-safe inline code span for arbitrary content. Bash templates can contain
 * the very delimiter — a backtick (command substitution) — which would close
 * the span early and garble the command a resuming agent must run. Per the GFM
 * rule, delimit with one more backtick than the longest internal run and pad
 * with a space when the content touches a backtick at either edge. Content with
 * no backtick (every slash command, most templates) renders as plain
 * `` `x` ``, byte-identical to before.
 */
function mdInlineCode(s: string): string {
  const runs = s.match(/`+/g);
  const longest = runs ? Math.max(...runs.map((r) => r.length)) : 0;
  const fence = "`".repeat(longest + 1);
  const pad = longest > 0 ? " " : "";
  return `${fence}${pad}${s}${pad}${fence}`;
}

/**
 * One checklist line per review step. A slash command renders as a bare
 * backticked command (its operator-vs-agent routing is governed by the target
 * skill's `disable-model-invocation`, not a mode). A `{ run, mode }` template
 * renders its `run` *verbatim* — placeholders left intact — plus an
 * unambiguous mode badge so a resuming agent knows whether to surface the
 * command (`print`) or run it itself via the Bash tool (`exec`).
 */
function renderStepItem(step: ReviewStep): string {
  if (typeof step === "string") return `- [ ] ${mdInlineCode(step)}`;
  const badge =
    step.mode === "exec"
      ? "**exec**: the resuming agent runs this via the Bash tool, then surfaces the findings"
      : "**print**: surface this command and stop for the operator to run";
  return `- [ ] ${mdInlineCode(step.run)} — ${badge}`;
}

// A template `run` mentioning one of the known stage-scoped placeholders is
// recorded verbatim — the renderer never substitutes (no diff or base exists at
// materialize time); the resuming agent fills it per the resume protocol. We
// match the exact placeholder vocabulary, not a generic `{…}` pattern, so a
// command with literal braces (e.g. `awk '{print}'`, `jq '{a}'`) doesn't
// spuriously claim a pending substitution.
function hasPlaceholderTemplate(steps: ReviewStep[]): boolean {
  return steps.some(
    (s) =>
      typeof s !== "string" &&
      REVIEW_PLACEHOLDERS.some((p) => s.run.includes(p)),
  );
}

function renderPipelineChecklist(steps: ReviewStep[] | undefined): string {
  if (steps === undefined || steps.length === 0) {
    return "- [ ] _No review steps configured._\n";
  }
  let out = steps.map(renderStepItem).join("\n") + "\n";
  if (hasPlaceholderTemplate(steps)) {
    out +=
      "\n_Template steps are recorded verbatim; the **resuming agent** substitutes their placeholders " +
      "per the resume protocol before running — the renderer never substitutes._\n";
  }
  return out;
}

function renderPreReviewBlock(steps: ReviewStep[] | undefined): string {
  let out = "## Pre-execution review\n\n";
  if (steps === undefined || steps.length === 0) {
    out +=
      "_No pre-execution review configured. Proceed to the cursor unit._\n";
    return out;
  }
  out +=
    "On the first session, before starting Unit 01, the **resuming agent** runs the step(s) below " +
    "against the freshly materialized plan dir, surfaces the findings, then **stops** to wait for " +
    "your go-ahead — it does not roll straight into Unit 01:\n\n";
  out += renderPipelineChecklist(steps);
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

function renderPlanReviewBlock(steps: ReviewStep[] | undefined): string {
  let out = "## Plan-level review\n\n";
  if (steps === undefined || steps.length === 0) {
    out +=
      "_No plan-level reviews configured. After the last unit, surface a summary and ask the user before archiving._\n";
    return out;
  }
  out +=
    "After the last unit's review lands and is committed, run these against the cumulative plan diff:\n\n";
  out += renderPipelineChecklist(steps);
  return out;
}

// Compact one-line cell for the overview table: labels only (a template's
// `run` text, a slash command as-is), joined with `+`. The per-step mode badge
// lives in the prose checklists, not this dense cell. A template `run` can
// contain `|` (a pipeline), which would otherwise open a spurious GFM table
// column, so escape it for the cell.
function overviewReviewsCell(steps: ReviewStep[] | undefined): string {
  if (steps === undefined || steps.length === 0) return "—";
  return steps
    .map(reviewStepLabel)
    .map((label) => label.replaceAll("|", "\\|"))
    .join(" + ");
}

function unitTopologyBlock(topology: Topology): string {
  return mermaid(topology)
    .map((g) => `\`\`\`mermaid\n${g}\n\`\`\``)
    .join("\n\n");
}
