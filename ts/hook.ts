import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { basename, isAbsolute, join } from "node:path";
import { z } from "zod";
import { type Config, loadConfig } from "./config.js";
import {
  MaterializeError,
  cleanupWorktree,
  materializeAt,
  resolveTargetDir,
  setupWorktree,
  todayYymmddLocal,
} from "./materialize.js";
import { parsePlanMarkdown } from "./parse-markdown.js";
import { formatError, isValidId, validatePlan } from "./validate.js";

// PreToolUse stdin shape: { session_id, tool_name, tool_input: { plan?,
// planFilePath?, allowedPrompts? } }. In the current Claude Code harness the
// agent WRITES its plan to the plan-mode plan file; when ExitPlanMode fires the
// harness reads that file and hands this hook BOTH the content (`plan`) and the
// path (`planFilePath`) — verified empirically against Claude Code 2.1.173,
// where the hook payload carries the full plan even when the model itself
// passed only `allowedPrompts`. We read the inlined `plan` first and fall back
// to reading `planFilePath` off disk, so materialization still works if a
// future harness stops inlining the content but keeps naming the file. Empty on
// BOTH channels is a loud failure (see resolvePlanSource), never a silent exit —
// that empty-payload case is exactly the mis-wire that used to no-op silently.
// Other fields are accepted but ignored; passthrough keeps us forward-compatible
// with payload additions.
const hookInputSchema = z.object({
  session_id: z.string(),
  tool_input: z
    .object({
      plan: z.string().optional(),
      planFilePath: z.string().optional(),
    })
    .passthrough()
    .optional(),
});

interface HookConfig {
  today: string;
  /** Where `/jidoka` was invoked from (CLAUDE_PROJECT_DIR or cwd). The
   * git_workflow path resolves the main checkout from here. */
  projectDir: string;
  plansRoot: string;
  cfg: Config;
}

function configFromEnv(): HookConfig {
  const projectDir = process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd();
  if (process.env["CLAUDE_PROJECT_DIR"] === undefined) {
    process.stderr.write(
      "jidoka hook: CLAUDE_PROJECT_DIR is unset; falling back to current working directory\n",
    );
  }
  const cfg = loadConfig(projectDir);
  const plansRoot = isAbsolute(cfg.plan_dir_root)
    ? cfg.plan_dir_root
    : join(projectDir, cfg.plan_dir_root);
  return {
    today: todayYymmddLocal(),
    projectDir,
    plansRoot,
    cfg,
  };
}

/**
 * Hook entry point. Always returns 0. Errors logged to stderr; deny payloads
 * (parse / validation / materialize failures) emitted on stdout.
 */
export async function runHook(): Promise<number> {
  try {
    const stdin = readFileSync(0, "utf8");
    const config = configFromEnv();
    runWithInput(stdin, config);
  } catch (e) {
    process.stderr.write(`jidoka hook: ${(e as Error).message}\n`);
  }
  return 0;
}

export function runWithInput(input: string, config: HookConfig): void {
  let raw: unknown;
  try {
    raw = JSON.parse(input);
  } catch (e) {
    throw new Error(`invalid hook input JSON: ${(e as Error).message}`);
  }
  const parsed = hookInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`invalid hook input JSON: ${parsed.error.message}`);
  }
  const sessionId = parsed.data.session_id;
  if (!isValidSessionId(sessionId)) {
    throw new Error(`invalid session_id: ${sessionId}`);
  }

  const source = resolvePlanSource(parsed.data.tool_input);
  if (!source.ok) {
    // No plan content on EITHER channel: the inlined `tool_input.plan` is
    // empty AND no readable plan file was named. In the current harness this
    // only happens when the plan was never written to the plan-mode plan file
    // before ExitPlanMode fired — the exact mis-wire that used to no-op
    // silently and leave the user thinking a plan had been drafted. Fail loud
    // so a broken wiring surfaces immediately instead of vanishing.
    emitDeny(emptyPlanDenyMessage(parsed.data.tool_input?.planFilePath));
    return;
  }
  const planMd = source.value;

  const planResult = parsePlanMarkdown(planMd);
  if (!planResult.ok) {
    emitDeny(`jidoka: cannot parse plan markdown: ${planResult.error}`);
    return;
  }
  const plan = planResult.value;

  const errors = validatePlan(plan);
  if (errors.length > 0) {
    const summary =
      "Plan validation failed:\n  " +
      errors.map(formatError).join("\n  ");
    emitDeny(summary);
    return;
  }

  // git_workflow (Unit 07): when on, land the plan in its own worktree on a
  // fresh `plan/<id>` branch off the trunk instead of in-tree, fixing the dir
  // name to the worktree's plan-id so the dir inside matches its worktree. A
  // non-git / degenerate-config repo falls back to in-tree; a *git* setup
  // failure denies rather than silently breaking the pure-worktree contract.
  // The hook always exits 0 either way.
  let plansRoot = config.plansRoot;
  let forcedDirName: string | undefined;
  let worktreeNote: string | undefined;
  let onPublishFailure: (() => void) | undefined;
  if (config.cfg.git_workflow) {
    const outcome = setupWorktree(
      plan,
      config.projectDir,
      config.cfg.plan_dir_root,
      config.today,
    );
    if (outcome.kind === "worktree") {
      plansRoot = outcome.plansRoot;
      forcedDirName = outcome.planId;
      worktreeNote = `Plan materialized at worktrees/${outcome.planId}/ — cd there to work.`;
      onPublishFailure = () =>
        cleanupWorktree(
          outcome.mainRoot,
          outcome.worktreePath,
          `plan/${outcome.planId}`,
        );
    } else if (outcome.kind === "deny") {
      emitDeny(
        `jidoka: ${outcome.reason}. No files were written; active/ stays clean.`,
      );
      return;
    } else {
      process.stderr.write(
        `jidoka hook: ${outcome.reason}; materializing in-tree\n`,
      );
    }
  }

  const target =
    forcedDirName !== undefined
      ? join(plansRoot, forcedDirName)
      : resolveTargetDir(plan, plansRoot, config.today);

  if (existsSync(target)) {
    onPublishFailure?.();
    emitDeny(
      `Plan dir ${target} already exists. Either remove it or pick a new slug via /jidoka.`,
    );
    return;
  }

  // Stage all writes into a sibling temp dir so a mid-write failure can't
  // leave a partial plan dir at the final target. On any failure after the
  // worktree was created, roll the worktree back too so no orphan is left.
  const staging = join(plansRoot, `.jidoka-stage-${sessionId}`);
  try {
    mkdirSync(plansRoot, { recursive: true });
    if (existsSync(staging)) {
      rmSync(staging, { recursive: true, force: true });
    }
    const finalDirName = basename(target);
    materializeAt(plan, staging, config.cfg, finalDirName);
    renameSync(staging, target);
  } catch (e) {
    try {
      rmSync(staging, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
    onPublishFailure?.();
    const msg =
      e instanceof MaterializeError ? e.message : (e as Error).message;
    emitDeny(
      `jidoka: failed to materialize plan: ${msg}. No files were written.`,
    );
    return;
  }

  process.stderr.write(`Wrote plan to ${target}\n`);
  if (worktreeNote !== undefined) process.stderr.write(worktreeNote + "\n");
}

type PlanSource = { ok: true; value: string } | { ok: false };

/**
 * Resolves the plan markdown from the hook payload. Prefers the inlined
 * `tool_input.plan` (what the harness injects from the plan file today); when
 * that's empty/absent, falls back to reading `tool_input.planFilePath` off
 * disk. Returns `{ ok: false }` only when BOTH channels are empty — the caller
 * turns that into a loud deny rather than a silent exit.
 */
function resolvePlanSource(
  toolInput: { plan?: string; planFilePath?: string } | undefined,
): PlanSource {
  const inline = toolInput?.plan;
  if (typeof inline === "string" && inline.trim().length > 0) {
    return { ok: true, value: inline };
  }
  const planFilePath = toolInput?.planFilePath;
  if (typeof planFilePath === "string" && planFilePath.trim().length > 0) {
    try {
      const fromFile = readFileSync(planFilePath, "utf8");
      if (fromFile.trim().length > 0) return { ok: true, value: fromFile };
    } catch {
      // Unreadable / missing plan file → treat as empty, deny below.
    }
  }
  return { ok: false };
}

function emptyPlanDenyMessage(planFilePath: string | undefined): string {
  const fileNote =
    typeof planFilePath === "string" && planFilePath.trim().length > 0
      ? ` The named plan file (${planFilePath}) was missing or empty.`
      : "";
  return (
    "jidoka: ExitPlanMode fired but no plan content reached the hook — " +
    "tool_input.plan was empty and no readable plan file was provided." +
    fileNote +
    " In the current Claude Code harness the plan must be WRITTEN to the " +
    "plan-mode plan file before ExitPlanMode; the harness then passes that " +
    "file's content to this hook as tool_input.plan. If you used /jidoka, write " +
    "the emitted plan markdown to that file (its path is shown in the plan-mode " +
    "reminder) and exit plan mode again. Nothing was materialized."
  );
}

function emitDeny(message: string): void {
  const deny = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: message,
    },
  };
  process.stdout.write(JSON.stringify(deny) + "\n");
}

function isValidSessionId(id: string): boolean {
  return isValidId(id) && id.length <= 128;
}

// --- test-only helpers ----------------------------------------------------
export const __testing = {
  runWithInput,
  isValidSessionId,
};
export type { HookConfig };
