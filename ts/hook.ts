import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { basename, isAbsolute, join } from "node:path";
import { z } from "zod";
import { loadConfig } from "./config.js";
import {
  MaterializeError,
  materializeAt,
  resolveTargetDir,
  todayYymmddLocal,
  writePlanHtml,
} from "./materialize.js";
import { openBrowser } from "./output.js";
import { parsePlanMarkdown } from "./parse-markdown.js";
import { formatError, isValidId, validatePlan } from "./validate.js";

// PreToolUse stdin shape: { session_id, tool_name, tool_input: { plan } }.
// The skill body produces the markdown that ExitPlanMode carries in `plan`,
// so we read it straight from there — no `/tmp/planview-*.json` ferry. Other
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
  plansRoot: string;
  autoOpenBrowser: boolean;
  htmlOutput: boolean;
}

function configFromEnv(): HookConfig {
  const projectDir = process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd();
  if (process.env["CLAUDE_PROJECT_DIR"] === undefined) {
    process.stderr.write(
      "planview hook: CLAUDE_PROJECT_DIR is unset; falling back to current working directory\n",
    );
  }
  const cfg = loadConfig(projectDir);
  const noOpen = process.env["PLANVIEW_NO_OPEN"] !== undefined;
  const plansRoot = isAbsolute(cfg.plan_dir_root)
    ? cfg.plan_dir_root
    : join(projectDir, cfg.plan_dir_root);
  return {
    today: todayYymmddLocal(),
    plansRoot,
    autoOpenBrowser: cfg.auto_open_browser && !noOpen,
    htmlOutput: cfg.html_output,
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
    process.stderr.write(`planview hook: ${(e as Error).message}\n`);
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
    emitDeny(`planview: cannot parse plan markdown: ${planResult.error}`);
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

  const target = resolveTargetDir(plan, config.plansRoot, config.today);

  if (existsSync(target)) {
    emitDeny(
      `Plan dir ${target} already exists. Either remove it or pick a new slug via /planview.`,
    );
    return;
  }

  // Stage all writes into a sibling temp dir so a mid-write failure can't
  // leave a partial plan dir at the final target.
  mkdirSync(config.plansRoot, { recursive: true });
  const staging = join(config.plansRoot, `.planview-stage-${sessionId}`);
  if (existsSync(staging)) {
    rmSync(staging, { recursive: true, force: true });
  }
  const finalDirName = basename(target);
  try {
    materializeAt(plan, staging, finalDirName);
    if (config.htmlOutput) writePlanHtml(plan, staging, finalDirName);
  } catch (e) {
    rmSync(staging, { recursive: true, force: true });
    const msg =
      e instanceof MaterializeError ? e.message : (e as Error).message;
    emitDeny(
      `planview: failed to materialize plan: ${msg}. No files were written.`,
    );
    return;
  }

  try {
    renameSync(staging, target);
  } catch (e) {
    rmSync(staging, { recursive: true, force: true });
    emitDeny(
      `planview: failed to publish plan dir ${target}: ${(e as Error).message}. No files were written.`,
    );
    return;
  }

  process.stderr.write(`Wrote plan to ${target}\n`);

  if (config.autoOpenBrowser && config.htmlOutput) {
    try {
      openBrowser(join(target, "overview.html"));
    } catch (e) {
      process.stderr.write(
        `planview hook: could not open browser: ${(e as Error).message}\n`,
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
