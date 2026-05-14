import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import type { Config } from "./config.js";
import { renderPlanHtml } from "./html.js";
import { buildOverviewMd, buildProgressMd, buildUnitMd } from "./render-md.js";
import type {
  Plan,
  ResolvedReviewStep,
  ReviewStep,
  Tool,
} from "./types.js";

export class MaterializeError extends Error {
  constructor(
    public readonly kind: "target_dir_exists" | "io" | "invalid_config",
    public readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = "MaterializeError";
  }
}

function resolveStep(
  step: ReviewStep,
  scope: string,
  index: number,
  tools: Record<string, Tool>,
): ResolvedReviewStep {
  const tool = tools[step.tool];
  if (tool === undefined) {
    const known = Object.keys(tools).sort().join(", ");
    throw new MaterializeError(
      "invalid_config",
      "<config>",
      `${scope}.steps[${index}]: unknown tool '${step.tool}' (defined tools: ${known || "(none)"})`,
    );
  }
  const needsOp =
    tool.run.includes("{op}") ||
    (tool.fallback !== undefined && tool.fallback.includes("{op}"));
  if (needsOp && step.op === undefined) {
    throw new MaterializeError(
      "invalid_config",
      "<config>",
      `${scope}.steps[${index}]: tool '${step.tool}' template requires '{op}' but the step provides none`,
    );
  }
  if (!needsOp && step.op !== undefined) {
    throw new MaterializeError(
      "invalid_config",
      "<config>",
      `${scope}.steps[${index}]: tool '${step.tool}' template has no '{op}' placeholder but the step provides one ('${step.op}')`,
    );
  }
  const op = step.op;
  const primary = op === undefined ? tool.run : tool.run.replaceAll("{op}", op);
  const resolved: ResolvedReviewStep = { primary };
  if (tool.fallback !== undefined) {
    resolved.fallback =
      op === undefined ? tool.fallback : tool.fallback.replaceAll("{op}", op);
  }
  if (step.note !== undefined) {
    resolved.note = step.note;
  }
  return resolved;
}

/**
 * Walks the config-side `unit` and `plan` pipelines, resolves each step into
 * a primary + optional fallback command (substituting `{op}` from the step),
 * and attaches the resulting `ResolvedReviewPipeline` to the in-memory plan
 * (`plan.plan_review_pipeline`) and to each unit (`unit.review_pipeline`).
 *
 * Throws `MaterializeError("invalid_config", ...)` when a step references an
 * unknown tool, or when `op` is missing/extra relative to the tool template.
 */
export function resolvePipelines(plan: Plan, config: Config): void {
  const tools = config.tools;
  for (const unit of plan.units) {
    const steps = config.review_pipelines.unit.steps.map((step, i) =>
      resolveStep(step, "review_pipelines.unit", i, tools),
    );
    unit.review_pipeline = { steps };
  }
  const planSteps = config.review_pipelines.plan.steps.map((step, i) =>
    resolveStep(step, "review_pipelines.plan", i, tools),
  );
  plan.plan_review_pipeline = { steps: planSteps };
}

/**
 * Computes the target plan dir under `plansRoot` for `plan` on `today`. Does
 * not create the directory. The shared daily counter is one greater than the
 * highest existing `^<today>-(\d+)-` entry across `plansRoot`,
 * `<parent>/research`, `<parent>/backlog`, and `<parent>/done/plan`.
 */
export function resolveTargetDir(
  plan: Plan,
  plansRoot: string,
  today: string,
): string {
  const n = nextCounter(plansRoot, today);
  return join(plansRoot, `${today}-${n}-${plan.slug}`);
}

function nextCounter(plansRoot: string, today: string): number {
  let maxN: number | undefined;
  considerDir(plansRoot, today, (n) => {
    maxN = maxN === undefined ? n : Math.max(maxN, n);
  });
  const parent = dirname(plansRoot);
  if (parent && parent !== plansRoot) {
    for (const sib of [
      join(parent, "research"),
      join(parent, "backlog"),
      join(parent, "done", "plan"),
    ]) {
      considerDir(sib, today, (n) => {
        maxN = maxN === undefined ? n : Math.max(maxN, n);
      });
    }
  }
  return maxN === undefined ? 0 : maxN + 1;
}

function considerDir(
  dir: string,
  today: string,
  onMatch: (n: number) => void,
): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return;
    throw new MaterializeError("io", dir, err.message);
  }
  const prefix = `${today}-`;
  for (const name of entries) {
    const stem = name.endsWith(".md") ? name.slice(0, -3) : name;
    if (!stem.startsWith(prefix)) continue;
    const rest = stem.slice(prefix.length);
    const dashIdx = rest.indexOf("-");
    if (dashIdx < 0) continue;
    const nStr = rest.slice(0, dashIdx);
    if (!/^\d+$/.test(nStr)) continue;
    onMatch(Number.parseInt(nStr, 10));
  }
}

/**
 * Materializes a validated `plan` into a fresh dir under `plansRoot` using
 * the shared daily counter. Returns the absolute path of the new dir.
 */
export function materialize(
  plan: Plan,
  plansRoot: string,
  today: string,
  config: Config,
): string {
  const target = resolveTargetDir(plan, plansRoot, today);
  materializeAt(plan, target, config);
  return target;
}

/**
 * Writes `plan` into `targetDir`. Throws if `targetDir` already exists.
 *
 * `dirNameOverride` controls the heading shown in `overview.md` and the
 * filename used internally. The hook passes the *final* target's basename
 * here so headings stay correct even when the actual disk write goes into a
 * staging dir that gets renamed afterward.
 */
export function materializeAt(
  plan: Plan,
  targetDir: string,
  config: Config,
  dirNameOverride?: string,
): void {
  resolvePipelines(plan, config);

  if (existsSync(targetDir)) {
    throw new MaterializeError(
      "target_dir_exists",
      targetDir,
      `Plan dir ${targetDir} already exists. Either remove it or pick a new slug via /planview.`,
    );
  }
  try {
    mkdirSync(targetDir, { recursive: true });
  } catch (e) {
    throw new MaterializeError("io", targetDir, (e as Error).message);
  }

  const dirName = dirNameOverride ?? basename(targetDir) ?? plan.slug;

  atomicWrite(join(targetDir, "overview.md"), buildOverviewMd(plan, dirName));
  atomicWrite(join(targetDir, "progress.md"), buildProgressMd(plan, dirName));
  for (const unit of plan.units) {
    atomicWrite(join(targetDir, `${unit.id}.md`), buildUnitMd(unit));
  }
}

/** Writes `<targetDir>/overview.html` from the plan + dir name. */
export function writePlanHtml(
  plan: Plan,
  targetDir: string,
  dirNameOverride?: string,
): void {
  const dirName = dirNameOverride ?? basename(targetDir) ?? plan.slug;
  const html = renderPlanHtml(plan, dirName);
  atomicWrite(join(targetDir, "overview.html"), html);
}

function atomicWrite(path: string, contents: string): void {
  const tmp = `${path}.tmp`;
  try {
    writeFileSync(tmp, contents);
    renameSync(tmp, path);
  } catch (e) {
    throw new MaterializeError("io", path, (e as Error).message);
  }
}

/** YYMMDD in local time. */
export function todayYymmddLocal(): string {
  const d = new Date();
  const yy = String(d.getFullYear() % 100).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

/** True if `path` exists and is a directory. */
export function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
