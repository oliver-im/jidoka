import { z } from "zod";

export type Output =
  | { kind: "inline" }
  | { kind: "file"; path: string };

export const outputSchema: z.ZodType<Output> = z.union([
  z.literal("inline").transform(() => ({ kind: "inline" }) as const),
  z
    .strictObject({
      file: z.string().min(1, "output.file must be a non-empty string"),
    })
    .transform(({ file }) => ({ kind: "file" as const, path: file })),
]);

export function serializeOutput(o: Output): "inline" | { file: string } {
  return o.kind === "inline" ? "inline" : { file: o.path };
}

export function serializeAgent(a: Agent): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: a.id,
    role: a.role,
    model: a.model,
    tools: a.tools,
    blocked_by: a.blocked_by,
    background: a.background,
    output: serializeOutput(a.output),
  };
  if (a.produces !== undefined) out["produces"] = a.produces;
  if (a.execution_mode !== undefined) out["execution_mode"] = a.execution_mode;
  if (a.agents !== undefined) out["agents"] = a.agents.map(serializeAgent);
  return out;
}

export function serializeTopology(t: Topology): Record<string, unknown> {
  return {
    task_summary: t.task_summary,
    execution_mode: t.execution_mode,
    agents: t.agents.map(serializeAgent),
  };
}

export const modelSchema = z.enum(["haiku", "sonnet", "opus"]);
export type Model = z.infer<typeof modelSchema>;

export const executionModeSchema = z.enum(["team", "subagents"]);
export type ExecutionMode = z.infer<typeof executionModeSchema>;

export interface Agent {
  id: string;
  role: string;
  model: Model;
  tools: string[];
  blocked_by: string[];
  background: boolean;
  output: Output;
  produces?: string;
  execution_mode?: ExecutionMode;
  agents?: Agent[];
}

const baseAgentSchema = z.object({
  id: z.string(),
  role: z.string(),
  model: modelSchema,
  tools: z.array(z.string()),
  blocked_by: z.array(z.string()),
  background: z.boolean(),
  output: outputSchema.optional().transform((v) => v ?? { kind: "inline" as const }),
  produces: z.string().optional(),
  execution_mode: executionModeSchema.optional(),
});

export const agentSchema: z.ZodType<Agent> = baseAgentSchema.extend({
  agents: z.lazy(() => z.array(agentSchema)).optional(),
});

export interface Topology {
  task_summary: string;
  execution_mode: ExecutionMode;
  agents: Agent[];
}

export const topologySchema: z.ZodType<Topology> = z.object({
  task_summary: z.string(),
  execution_mode: executionModeSchema,
  agents: z.array(agentSchema),
});

// Each review command is a Claude Code slash command, e.g. the built-in
// "/code-review" (local working-tree diff) or "/codex:adversarial-review".
// Note "/code-review" (built-in, reviews a local diff) is NOT the same as
// "/code-review:code-review" (the code-review plugin, which reviews a GitHub
// PR). The user lists commands directly in the config; there is no name
// lookup, no `{op}` substitution, no bash escape hatch.
export const reviewCommandSchema = z
  .string()
  .min(1, "review command must be a non-empty string")
  .startsWith("/", "review command must start with '/'");

export interface Unit {
  id: string;
  title: string;
  summary: string;
  blocked_by: string[];
  agents_involved?: string[];
  body_markdown: string;
  topology?: Topology;
  // Materializer-attached: a copy of config.unit_review. Never present on
  // parsed input; set by `resolvePipelines` after schema validation.
  review?: string[];
}

export const unitSchema: z.ZodType<Unit> = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  blocked_by: z.array(z.string()),
  agents_involved: z.array(z.string()).optional(),
  body_markdown: z.string(),
  // `topology: null` is the producer-contract sentinel for "no embedded
  // topology"; both omission and explicit null normalize to undefined.
  topology: z
    .union([z.null(), topologySchema])
    .optional()
    .transform((v) => (v == null ? undefined : v)),
});

export interface Plan {
  task_summary: string;
  slug: string;
  units: Unit[];
  // Materializer-attached: a copy of config.pre_review. Never present on
  // parsed input; set by `resolvePipelines` after schema validation.
  pre_review?: string[];
  // Materializer-attached: a copy of config.plan_review. Never present on
  // parsed input; set by `resolvePipelines` after schema validation.
  plan_review?: string[];
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

export function parseTopology(input: unknown): ParseResult<Topology> {
  const result = topologySchema.safeParse(input);
  if (!result.success) {
    return { ok: false, error: formatZodError(result.error) };
  }
  return { ok: true, value: result.data };
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

export function parseTopologyJson(json: string): ParseResult<Topology> {
  let raw: unknown;
  try {
    raw = JSON.parse(stripBom(json));
  } catch (e) {
    return { ok: false, error: `JSON parse error: ${(e as Error).message}` };
  }
  return parseTopology(raw);
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
