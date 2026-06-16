import { z } from "zod";

// A review step is EITHER a slash command (e.g. the built-in "/code-review" —
// local working-tree diff — or "/codex:adversarial-review") OR a tool-agnostic
// bash *template* object `{ run, mode }` (e.g. { run: "codex exec ...", mode:
// "exec" }), so the pipeline isn't tied to slash commands or any one tool.
//
// Object form (not a prefix-tagged string) because a bash template can
// legitimately start with "/" (absolute paths), so prefix-tagging would be
// ambiguous; an object is unambiguous and extensible.
//
// `mode` is a TEMPLATE-ONLY field — "print" (default): surface the command for
// the operator to run; "exec": the resuming agent runs it via the Bash tool.
// For slash-command steps, operator-vs-agent is governed by the target skill's
// `disable-model-invocation`, not by a mode.
//
// Note "/code-review" (built-in, local diff) is NOT "/code-review:code-review"
// (the code-review plugin, which reviews a GitHub PR).
//
// Template placeholders ({plan_dir}, {base}, {diff_range}, {focus}) are
// stage-scoped and substituted in the resume/agent layer, never here — the
// renderer only records the step verbatim. `pre_review` runs before any unit
// (no diff), so only {plan_dir} is meaningful there.
export const reviewStepModeSchema = z.enum(["print", "exec"]);
export type ReviewStepMode = z.infer<typeof reviewStepModeSchema>;

export const reviewTemplateStepSchema = z.strictObject({
  run: z.string().min(1, "review template 'run' must be a non-empty string"),
  mode: reviewStepModeSchema.default("print"),
});
export type ReviewTemplateStep = z.infer<typeof reviewTemplateStepSchema>;

// The stage-scoped placeholders a review template's `run` may contain. Single
// source of truth: the renderer only *detects* them (to note that substitution
// is still pending), while the resume/agent layer substitutes them. `pre_review`
// runs before any diff exists, so only `{plan_dir}` is meaningful there — the
// resume protocol enforces the per-stage scope.
export const REVIEW_PLACEHOLDERS = [
  "{plan_dir}",
  "{base}",
  "{diff_range}",
  "{focus}",
] as const;

export const reviewStepSchema = z.union([
  z
    .string()
    .min(1, "review command must be a non-empty string")
    .startsWith("/", "review command must start with '/'"),
  reviewTemplateStepSchema,
]);
export type ReviewStep = z.infer<typeof reviewStepSchema>;

// Compact display label for a step: a slash command is its own label; a
// template labels as its `run` text. Used where one dense line is wanted (the
// overview table cell, the HTML unit card). The prose checklists in
// `render-md.ts` render the richer form on top of this — the `print`/`exec`
// mode badge and the pre_review auto-run framing.
export function reviewStepLabel(step: ReviewStep): string {
  return typeof step === "string" ? step : step.run;
}

export interface Unit {
  id: string;
  title: string;
  summary: string;
  blocked_by: string[];
  agents_involved?: string[];
  body_markdown: string;
  // Materializer-attached: a copy of config.unit_review. Never present on
  // parsed input; set by `resolvePipelines` after schema validation.
  review?: ReviewStep[];
}

export const unitSchema: z.ZodType<Unit> = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  blocked_by: z.array(z.string()),
  agents_involved: z.array(z.string()).optional(),
  body_markdown: z.string(),
});

export interface Plan {
  task_summary: string;
  slug: string;
  units: Unit[];
  // Materializer-attached: a copy of config.pre_review. Never present on
  // parsed input; set by `resolvePipelines` after schema validation.
  pre_review?: ReviewStep[];
  // Materializer-attached: a copy of config.plan_review. Never present on
  // parsed input; set by `resolvePipelines` after schema validation.
  plan_review?: ReviewStep[];
  // Materializer-attached: a copy of config.git_workflow. Never present on
  // parsed input; set by `resolvePipelines` after schema validation.
  git_workflow?: boolean;
}

export const planSchema: z.ZodType<Plan> = z.object({
  task_summary: z.string(),
  slug: z.string(),
  units: z.array(unitSchema),
});

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function formatZodError(e: z.ZodError): string {
  const issues = e.issues.map((i) => {
    const path = i.path.length > 0 ? i.path.join(".") : "<root>";
    return `${path}: ${i.message}`;
  });
  return issues.join("; ");
}

export function parsePlan(input: unknown): ParseResult<Plan> {
  const result = planSchema.safeParse(input);
  if (!result.success) {
    return { ok: false, error: formatZodError(result.error) };
  }
  return { ok: true, value: result.data };
}

// JSON.parse rejects a leading BOM, but real-world inputs (Notepad on
// Windows, Excel exports, some editor save defaults) include one. Strip it
// here so every caller is BOM-tolerant without per-caller boilerplate.
function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
}

export function parsePlanJson(json: string): ParseResult<Plan> {
  let raw: unknown;
  try {
    raw = JSON.parse(stripBom(json));
  } catch (e) {
    return { ok: false, error: `JSON parse error: ${(e as Error).message}` };
  }
  return parsePlan(raw);
}
