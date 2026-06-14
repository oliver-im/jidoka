import type { ParseResult, Plan, Topology, Unit } from "./types.js";
import { parseTopologyJson } from "./types.js";

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
 *   - `topology` is omitted unless the unit body contains a fenced
 *     ```` ```topology ```` block, in which case the fence content is
 *     JSON-parsed, validated against `topologySchema`, attached to
 *     `unit.topology`, and stripped from `body_markdown` so the
 *     downstream renderer (which builds Mermaid from the typed object)
 *     doesn't render it twice.
 *
 * Returns `{ ok: false, error }` if no title or no units are found, or
 * if a unit's topology fence is malformed (unterminated, doubled, bad
 * JSON, or schema-invalid) — those errors are prefixed with
 * `units[k].topology:`. All other shape problems (empty summary, etc.)
 * surface via `validatePlan`.
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

    const fence = extractTopologyFence(bodyMarkdown);
    if (!fence.ok) {
      return { ok: false, error: `units[${k}].topology: ${fence.error}` };
    }

    const unit: Unit = {
      id,
      title: cur.title,
      summary,
      blocked_by: k === 0 ? [] : [units[k - 1]!.id],
      body_markdown: fence.value.bodyWithoutFence,
    };
    if (fence.value.topology !== undefined) {
      unit.topology = fence.value.topology;
    }
    units.push(unit);
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

// CommonMark-style fence line: 3+ backticks at column 0, optional info string.
// The opener's tick count is recorded so the closer can require ≥ as many
// (CommonMark §4.5). We stay column-0 strict for both ticks and info — the
// 1–3 leading-space indentation that CommonMark allows is intentionally
// rejected so we don't false-match inside indented JSON-like prose.
const FENCE_LINE_RE = /^(`{3,})(.*)$/;

// Walks the body line-by-line tracking fenced-block state so that:
//   - a `topology` info string nested inside another fenced block is left as
//     prose, not extracted (CommonMark: lines inside an open fence are content);
//   - a non-topology fence's closer is never misread as the topology closer;
//   - a fence opened with N>3 backticks closes only on a line with ≥N ticks.
// Only the outermost top-level `topology` fence is extracted; a second one at
// top level is rejected as "multiple topology fences".
function extractTopologyFence(
  bodyMarkdown: string,
): ParseResult<{ bodyWithoutFence: string; topology: Topology | undefined }> {
  if (bodyMarkdown.length === 0) {
    return { ok: true, value: { bodyWithoutFence: "", topology: undefined } };
  }

  const lines = bodyMarkdown.split("\n");
  type State =
    | { kind: "outside" }
    | { kind: "inside"; topology: boolean; ticks: number };
  let state: State = { kind: "outside" };
  let openIdx = -1;
  let closeIdx = -1;
  let secondTopologyAt = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const m = FENCE_LINE_RE.exec(line);
    if (!m) continue;
    const ticks = m[1]!.length;
    const info = m[2]!.trim();

    if (state.kind === "outside") {
      if (info === "topology") {
        if (openIdx >= 0) {
          secondTopologyAt = i;
          break;
        }
        state = { kind: "inside", topology: true, ticks };
        openIdx = i;
      } else {
        state = { kind: "inside", topology: false, ticks };
      }
    } else if (info === "" && ticks >= state.ticks) {
      if (state.topology) closeIdx = i;
      state = { kind: "outside" };
    }
  }

  if (openIdx < 0) {
    return { ok: true, value: { bodyWithoutFence: bodyMarkdown, topology: undefined } };
  }
  if (closeIdx < 0) {
    return { ok: false, error: "unterminated topology fence (missing closing ```)" };
  }
  if (secondTopologyAt >= 0) {
    return { ok: false, error: "multiple topology fences in one unit (only one allowed)" };
  }

  const jsonContent = lines.slice(openIdx + 1, closeIdx).join("\n");
  const parsed = parseTopologyJson(jsonContent);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  // Seam-only cleanup: drop the trailing blank lines of the pre-fence segment
  // and the leading blank lines of the post-fence segment, then rejoin with a
  // single blank line if both sides have content. This preserves indentation
  // and any user-authored blank-line patterns elsewhere in the body.
  const before = lines.slice(0, openIdx);
  const after = lines.slice(closeIdx + 1);
  let beforeEnd = before.length;
  while (beforeEnd > 0 && before[beforeEnd - 1]!.trim().length === 0) beforeEnd--;
  let afterStart = 0;
  while (afterStart < after.length && after[afterStart]!.trim().length === 0) afterStart++;
  const beforeKept = before.slice(0, beforeEnd);
  const afterKept = after.slice(afterStart);
  const bodyWithoutFence =
    beforeKept.length === 0
      ? afterKept.join("\n")
      : afterKept.length === 0
        ? beforeKept.join("\n")
        : `${beforeKept.join("\n")}\n\n${afterKept.join("\n")}`;

  return { ok: true, value: { bodyWithoutFence, topology: parsed.value } };
}
