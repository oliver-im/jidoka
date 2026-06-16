import type { ParseResult, Plan, Unit } from "./types.js";

/**
 * Parses a markdown plan into a {@link Plan}.
 *
 * Shape the parser expects (canonical, what the skill emits):
 *
 *     # <task summary>
 *
 *     <optional preamble — ignored>
 *
 *     ## Unit 01: <title>
 *
 *     <first paragraph → unit.summary>
 *
 *     <rest of section → unit.body_markdown>
 *
 *     ## Unit 02: <title>
 *     ...
 *
 * Tolerant of these unit-heading variants (canonicalized internally):
 *
 *     ## Unit 1: <title>          single-digit number
 *     ## Step 01: <title>         "Step" instead of "Unit"
 *     ## 01: <title>              bare number, colon
 *     ## 01. <title>              bare number, period
 *     ## 01 - <title>             bare number, hyphen separator
 *     ## 01 — <title>             bare number, em-dash separator
 *
 * Title fallback: if no `# ...` H1 is present, the first non-empty,
 * non-heading line becomes the task_summary. Defaults applied per unit:
 *
 *   - `id` = `NN-<slugified-title>` (sequential, 1-based, 2-digit pad)
 *   - `blocked_by` = `[units[k-1].id]` for k > 0, else `[]`
 *   - `agents_involved` is omitted
 *
 * Returns `{ ok: false, error }` if no title or no units are found. All
 * other shape problems (empty summary, etc.) surface via `validatePlan`.
 */
export function parsePlanMarkdown(md: string): ParseResult<Plan> {
  const stripped = md.charCodeAt(0) === 0xFEFF ? md.slice(1) : md;
  const normalized = stripped.replace(/\r\n/g, "\n");
  const lines = unwrapOuterFence(normalized).split("\n");

  const title = extractTitle(lines);
  if (!title) {
    return {
      ok: false,
      error: "no plan title found (need a `# Title` heading or a non-empty first line before any `##` unit heading)",
    };
  }

  const slug = slugify(title.text, 60);
  if (slug.length === 0) {
    return {
      ok: false,
      error: `cannot derive slug from title '${title.text}' (no alphanumeric characters)`,
    };
  }

  const headings: { lineIndex: number; title: string }[] = [];
  for (let i = title.lineIndex + 1; i < lines.length; i++) {
    const m = UNIT_HEADING_RE.exec(lines[i]!);
    if (m) headings.push({ lineIndex: i, title: m[2]!.trim() });
  }

  if (headings.length === 0) {
    return {
      ok: false,
      error: "no unit headings found (expected `## Unit NN: <title>` or a tolerated variant)",
    };
  }

  const units: Unit[] = [];
  for (let k = 0; k < headings.length; k++) {
    const cur = headings[k]!;
    const next = headings[k + 1];
    const sectionLines = lines.slice(cur.lineIndex + 1, next?.lineIndex ?? lines.length);
    const { summary, bodyMarkdown } = splitSummaryAndBody(sectionLines);

    const seq = String(k + 1).padStart(2, "0");
    const titleSlug = slugify(cur.title, 57);
    const id = titleSlug.length > 0 ? `${seq}-${titleSlug}` : `${seq}-unit`;

    units.push({
      id,
      title: cur.title,
      summary,
      blocked_by: k === 0 ? [] : [units[k - 1]!.id],
      body_markdown: bodyMarkdown,
    });
  }

  return {
    ok: true,
    value: {
      task_summary: title.text,
      slug,
      units,
    },
  };
}

// `## Unit 01: …`, `## Step 1 - …`, `## 01. …`, etc. The optional `Unit|Step`
// prefix is case-insensitive; the separator may be `:`, `.`, `-`, or em-dash.
const UNIT_HEADING_RE = /^##\s+(?:(?:Unit|Step)\s+)?(\d{1,3})\s*[:.—\-]\s*(.+?)\s*$/i;

// If the entire input is a single fenced code block whose info string is
// empty or `markdown`, strip that wrapper. This handles the case where the
// `/jidoka` skill emits its plan inside a ```markdown fence (per
// `.claude/skills/jidoka/SKILL.md`) and the caller pastes the fenced
// payload through ExitPlanMode verbatim. We require the closer to use
// exactly the same tick count as the opener (stricter than CommonMark
// §4.5's "≥ N") so that an internal fence whose closer happens to be the
// last line of the content is never misidentified as the outer wrapper's
// closer; the closer must also be at end-of-input after trimming.
const OUTER_FENCE_OPEN_RE = /^(`{3,})(?:[ \t]*markdown[ \t]*)?[ \t]*\n/;
function unwrapOuterFence(md: string): string {
  const trimmed = md.replace(/^\s+|\s+$/g, "");
  const open = OUTER_FENCE_OPEN_RE.exec(trimmed);
  if (!open) return md;
  const ticks = open[1]!;
  const closer = new RegExp(`\\n${ticks}[ \\t]*$`);
  const afterOpen = trimmed.slice(open[0].length);
  if (!closer.test(afterOpen)) return md;
  return afterOpen.replace(closer, "");
}

const TITLE_HEADING_RE = /^#\s+(.+?)\s*$/;

function extractTitle(lines: string[]): { lineIndex: number; text: string } | undefined {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (UNIT_HEADING_RE.test(line)) return undefined;
    const h1 = TITLE_HEADING_RE.exec(line);
    if (h1) return { lineIndex: i, text: h1[1]!.trim() };
    const trimmed = line.trim();
    if (trimmed.length > 0 && !trimmed.startsWith("#")) {
      return { lineIndex: i, text: trimmed };
    }
  }
  return undefined;
}

function slugify(s: string, max: number): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/, "");
}

function splitSummaryAndBody(lines: string[]): {
  summary: string;
  bodyMarkdown: string;
} {
  let i = 0;
  while (i < lines.length && lines[i]!.trim().length === 0) i++;

  const summaryLines: string[] = [];
  while (i < lines.length && lines[i]!.trim().length > 0) {
    summaryLines.push(lines[i]!.trim());
    i++;
  }

  while (i < lines.length && lines[i]!.trim().length === 0) i++;

  const summary = summaryLines.join(" ").trim();
  const bodyMarkdown = lines.slice(i).join("\n").replace(/\s+$/, "");

  return { summary, bodyMarkdown };
}
