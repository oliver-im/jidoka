import { mermaid } from "./mermaid.js";
import type { Plan, Topology, Unit } from "./types.js";

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
  const lines: string[] = [];
  lines.push(`# ${dirName} — ${plan.task_summary}\n`);

  lines.push(`## Goal\n`);
  let goal = plan.task_summary;
  if (!goal.endsWith(".")) goal += ".";
  lines.push(`${goal}\n`);

  lines.push(`## Context\n`);
  lines.push(`_Why-now and the context that motivated this plan._\n`);
  lines.push(`## Decisions (locked, v1)\n`);
  lines.push(`_Lock decisions here so units don't have to re-litigate them._\n`);
  lines.push(`## Out of scope (v1)\n`);
  lines.push(`_Items deferred or explicitly not addressed._\n`);

  lines.push(`## Unit list\n`);
  const tableRows: string[] = [
    "| # | Title | Blocked by | Reviews |",
    "|---|---|---|---|",
  ];
  for (const unit of plan.units) {
    const prefix = unitIdPrefix(unit.id) ?? unit.id;
    const blockedBy =
      unit.blocked_by.length === 0
        ? "—"
        : unit.blocked_by.map((b) => unitIdPrefix(b) ?? b).join(", ");
    const reviews =
      unit.review_steps.length === 0 ? "—" : unit.review_steps.join(" + ");
    tableRows.push(`| ${prefix} | ${unit.title} | ${blockedBy} | ${reviews} |`);
  }
  lines.push(tableRows.join("\n") + "\n");

  lines.push(`## Cross-cutting constraints\n`);
  lines.push(`_Conventions, invariants, etc._\n`);
  lines.push(`## References\n`);
  lines.push(`_Linked docs and external context._`);

  // Match the Rust output: each section ends with "\n\n"; final References
  // ends with a single newline. The pushes above put one trailing newline on
  // each entry; joining with "\n" yields the right shape.
  return lines.join("\n") + "\n";
}

export function buildProgressMd(plan: Plan, dirName: string): string {
  const cursor = plan.units[0]?.id ?? "(no units)";
  let out = "";
  out += `# ${dirName} — Progress\n\n`;
  out += `**Cursor:** ${cursor} (not started).\n\n`;
  out += `## Done\n\n_Nothing yet._\n\n`;
  out += `## Blockers\n\n_None._\n\n`;
  out += `## Notes\n\n`;
  out +=
    "- When resuming, read this file first to find the cursor unit, then read the cursor unit's md. Skip `overview.md` unless this is the first session on the plan.\n";
  out +=
    "- Work one unit at a time. After finishing the cursor unit, run its review steps, then update this file: move the unit into Done with a one-liner and advance the cursor to the next unit id.\n";
  out +=
    "- Stop after each unit. Surface a brief summary to the user and wait for explicit go-ahead before starting the next unit. If the unit is blocked, record it under Blockers and stop without advancing the cursor.\n";
  return out;
}

export function buildUnitMd(unit: Unit): string {
  const prefix = unitIdPrefix(unit.id) ?? unit.id;
  let out = "";

  out += `# Unit ${prefix} — ${unit.title}\n\n`;

  const blockedBy =
    unit.blocked_by.length === 0 ? "none" : unit.blocked_by.join(", ");
  const agents =
    unit.agents_involved && unit.agents_involved.length > 0
      ? unit.agents_involved.join(", ")
      : "main only";
  const topology = unit.topology !== undefined ? "present" : "none";

  out += `**Blocked by:** ${blockedBy}\n`;
  out += `**Agents involved:** ${agents}\n`;
  out += `**Topology:** ${topology}\n\n`;

  out += `## Summary\n\n`;
  out += unit.summary;
  if (unit.summary.length > 0 && !unit.summary.endsWith("\n")) out += "\n";
  out += "\n";

  if (unit.body_markdown.length > 0) {
    out += unit.body_markdown;
    if (!unit.body_markdown.endsWith("\n")) out += "\n";
    out += "\n";
  }

  if (unit.topology !== undefined) {
    out += unitTopologyBlock(unit.topology);
    out += "\n\n";
  }

  out += `## Review\n\n`;
  if (unit.review_steps.length === 0) {
    out += "- [ ] _No review steps recorded._\n";
  } else {
    for (const step of unit.review_steps) out += `- [ ] ${step}\n`;
  }
  out += "\n---\nSee `progress.md` for the cursor and overall plan state.\n";

  return out;
}

function unitTopologyBlock(topology: Topology): string {
  return mermaid(topology)
    .map((g) => `\`\`\`mermaid\n${g}\n\`\`\``)
    .join("\n\n");
}
