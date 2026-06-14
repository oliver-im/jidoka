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
  writePlanHtml,
} from "./materialize.js";
import { openBrowser } from "./output.js";
import { parsePlanMarkdown } from "./parse-markdown.js";
import { formatError, isValidId, validatePlan } from "./validate.js";

// PreToolUse stdin shape: { session_id, tool_name, tool_input: { plan } }.
// The skill body produces the markdown that ExitPlanMode carries in `plan`,
// so we read it straight from there — no `/tmp/jidoka-*.json` ferry. Other
// fields are accepted but ignored; passthrough keeps us forward-compatible
// with payload additions.
const hookInputSchema = z.object({
  session_id: z.string(),
  tool_input: z
    .object({
      plan: z.string().optional(),
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
  autoOpenBrowser: boolean;
  htmlOutput: boolean;
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
  const noOpen = process.env["JIDOKA_NO_OPEN"] !== undefined;
  const plansRoot = isAbsolute(cfg.plan_dir_root)
    ? cfg.plan_dir_root
    : join(projectDir, cfg.plan_dir_root);
  return {
    today: todayYymmddLocal(),
    projectDir,
    plansRoot,
    autoOpenBrowser: cfg.auto_open_browser && !noOpen,
    htmlOutput: cfg.html_output,
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

  const planMd = parsed.data.tool_input?.plan;
  if (planMd === undefined || planMd.trim().length === 0) {
    // No plan markdown in the payload. Skill probably didn't run, or the
    // user is exiting plan mode without one. Stay out of the way.
    return;
  }

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
    if (config.htmlOutput) writePlanHtml(plan, staging, finalDirName);
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

  if (config.autoOpenBrowser && config.htmlOutput) {
    try {
      openBrowser(join(target, "overview.html"));
    } catch (e) {
      process.stderr.write(
        `jidoka hook: could not open browser: ${(e as Error).message}\n`,
      );
    }
  }
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
