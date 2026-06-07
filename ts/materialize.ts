import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, isAbsolute, join } from "node:path";
import type { Config } from "./config.js";
import { renderPlanHtml } from "./html.js";
import { buildOverviewMd, buildProgressMd, buildUnitMd } from "./render-md.js";
import type { Plan } from "./types.js";

export class MaterializeError extends Error {
  constructor(
    public readonly kind: "target_dir_exists" | "io",
    public readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = "MaterializeError";
  }
}

/**
 * Copies config onto the in-memory plan at materialize time: the review
 * slash-command arrays — `pre_review` (plan-level pre-execution),
 * `plan_review` (plan-level post-execution), and per-unit `unit_review`,
 * each rendered verbatim with no tool lookup or substitution — plus the
 * `git_workflow` flag that gates the `## Git workflow` block in progress.md.
 */
export function resolvePipelines(plan: Plan, config: Config): void {
  for (const unit of plan.units) {
    unit.review = [...config.unit_review];
  }
  plan.pre_review = [...config.pre_review];
  plan.plan_review = [...config.plan_review];
  plan.git_workflow = config.git_workflow;
}

/**
 * Computes the target plan dir under `plansRoot` for `plan` on `today`. Does
 * not create the directory. The daily counter is one greater than the highest
 * existing `^<today>-(\d+)-` entry inside `plansRoot`. Sibling note dirs
 * (backlog, research, archived plans, etc.) are not scanned — keeping that
 * convention out of the code. A `N` previously occupied by a now-moved entry
 * can therefore reappear; rename at move-time if it bothers you.
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
  return nextCounterAcross([plansRoot], today);
}

/** Daily counter one greater than the highest `^<today>-(\d+)-` entry across
 * any of `dirs` (missing dirs are skipped). */
function nextCounterAcross(dirs: string[], today: string): number {
  let maxN: number | undefined;
  for (const dir of dirs) {
    considerDir(dir, today, (n) => {
      maxN = maxN === undefined ? n : Math.max(maxN, n);
    });
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
 * the daily counter. Returns the absolute path of the new dir.
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

export interface WorktreeSetup {
  /** Effective plansRoot to materialize into (inside the new worktree). */
  plansRoot: string;
  /** The derived plan-id (`<today>-N-slug`); also the worktree + branch name. */
  planId: string;
  /** Absolute path to the created worktree. */
  worktreePath: string;
}

/**
 * `git_workflow` scaffolding (Unit 07). Anchors at the *main* checkout — even
 * when `/planview` is invoked from inside another plan's worktree — derives
 * the plan-id, then creates `<main>/worktrees/<plan-id>` on a fresh
 * `plan/<plan-id>` branch (off the main checkout's HEAD) and returns the
 * plansRoot inside it, so the hook materializes there instead of in-tree.
 *
 * Returns undefined — logging why to stderr — on every failure mode (not a
 * git repo, an absolute `plan_dir_root`, an existing worktree/branch for this
 * id, or any git error). The hook then falls back to the normal in-tree
 * materialize and still exits 0. Never throws: a non-zero hook would block
 * ExitPlanMode permanently.
 */
export function setupWorktree(
  plan: Plan,
  fromDir: string,
  planDirRoot: string,
  today: string,
): WorktreeSetup | undefined {
  if (isAbsolute(planDirRoot)) {
    process.stderr.write(
      "planview hook: git_workflow needs a relative plan_dir_root; materializing in-tree\n",
    );
    return undefined;
  }
  const mainRoot = mainWorktreeRoot(fromDir);
  if (mainRoot === undefined) {
    process.stderr.write(
      "planview hook: git_workflow is on but this isn't a git worktree; materializing in-tree\n",
    );
    return undefined;
  }

  let planId: string;
  try {
    // The daily counter scans the main checkout's active-plan index — the
    // `worktrees/` dir (where in-flight worktree-mode plans live) plus its
    // in-tree `active/` (normally empty in this mode, but covers a same-day
    // mode switch). Mirrors resolveTargetDir's deliberate not-scanning of
    // archived/sibling dirs, so a stale N can reappear after a move.
    const n = nextCounterAcross(
      [join(mainRoot, "worktrees"), join(mainRoot, planDirRoot)],
      today,
    );
    planId = `${today}-${n}-${plan.slug}`;
  } catch (e) {
    process.stderr.write(
      `planview hook: git_workflow counter scan failed (${(e as Error).message}); materializing in-tree\n`,
    );
    return undefined;
  }

  const worktreePath = join(mainRoot, "worktrees", planId);
  if (existsSync(worktreePath)) {
    process.stderr.write(
      `planview hook: ${worktreePath} already exists; materializing in-tree\n`,
    );
    return undefined;
  }

  try {
    // No explicit start-point: fork from the main checkout's HEAD (normally
    // the trunk). Avoids hardcoding `main`, which would break repos whose
    // default branch is named otherwise.
    execFileSync(
      "git",
      ["-C", mainRoot, "worktree", "add", worktreePath, "-b", `plan/${planId}`],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
  } catch (e) {
    process.stderr.write(
      `planview hook: git worktree add failed (${gitErr(e)}); materializing in-tree\n`,
    );
    return undefined;
  }

  return { plansRoot: join(worktreePath, planDirRoot), planId, worktreePath };
}

/**
 * Resolves the main checkout's working-tree root from any dir inside the repo
 * (including a linked worktree): `git worktree list --porcelain` always lists
 * the main worktree first. Returns undefined when `fromDir` isn't in a git
 * repo or git is unavailable.
 */
function mainWorktreeRoot(fromDir: string): string | undefined {
  let out: string;
  try {
    out = execFileSync(
      "git",
      ["-C", fromDir, "worktree", "list", "--porcelain"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
  } catch {
    return undefined;
  }
  for (const line of out.split("\n")) {
    if (line.startsWith("worktree ")) {
      const path = line.slice("worktree ".length).trim();
      return path.length > 0 ? path : undefined;
    }
  }
  return undefined;
}

/** First stderr line from a failed execFileSync git call, else its message. */
function gitErr(e: unknown): string {
  const err = e as { stderr?: Buffer | string; message?: string };
  const stderr = err.stderr ? err.stderr.toString().trim() : "";
  if (stderr.length > 0) return stderr.split("\n")[0] ?? stderr;
  return err.message ?? "unknown git error";
}
