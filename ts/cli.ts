import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { Command } from "commander";
import { loadConfig } from "./config.js";
import { runHook } from "./hook.js";
import { materialize, todayYymmddLocal } from "./materialize.js";
import { parsePlanMarkdown } from "./parse-markdown.js";
import { type ParseResult, type Plan, parsePlanJson } from "./types.js";
import { formatError, validatePlan } from "./validate.js";

declare const __JIDOKA_VERSION__: string;

const program = new Command();
program
  .name("jidoka")
  .description(
    "Materialize plan-mode output as reviewable markdown units on ExitPlanMode",
  )
  .version(__JIDOKA_VERSION__, "-v, --version", "Show version number");

program
  .command("hook")
  .description("Process ExitPlanMode hook from stdin")
  .action(async () => {
    const code = await runHook();
    process.exit(code);
  });

program
  .command("materialize <file>")
  .description(
    "Materialize a plan markdown (or legacy Plan JSON) into <plan_dir_root>/<YYMMDD-N-slug>/ (use - for stdin). Writes the plan's md files ONLY — it does NOT create a git worktree even when git_workflow is enabled; only the ExitPlanMode `hook` does that.",
  )
  .option(
    "--plans-root <dir>",
    "Override the plans root (default: <CLAUDE_PROJECT_DIR or cwd>/<plan_dir_root>, layered config honored; plan_dir_root defaults to 'plan')",
  )
  .option("--today <yymmdd>", "Override today's date prefix")
  .addHelpText(
    "after",
    "\nNote: `materialize` is the in-tree / recovery path — it never sets up the\n" +
      "per-plan worktree or `plan/<id>` branch that the ExitPlanMode `hook` creates\n" +
      "under git_workflow. It is therefore NOT a drop-in for the hook flow. If you\n" +
      "used it to recover a plan that should live in a worktree, create the worktree\n" +
      "yourself (e.g. `git worktree add worktrees/<id> -b plan/<id> <trunk>`) and move\n" +
      "the materialized dir into it.",
  )
  .action((file: string, opts: { plansRoot?: string; today?: string }) => {
    runMaterialize(file, opts);
  });

function runMaterialize(
  file: string,
  opts: { plansRoot?: string; today?: string },
): void {
  let input: string;
  try {
    input = file === "-" ? readFileSync(0, "utf8") : readFileSync(file, "utf8");
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    const target = file === "-" ? "stdin" : `'${file}'`;
    process.stderr.write(`error: cannot read ${target}: ${err.message}\n`);
    process.exit(1);
  }

  const parsed = parsePlanInput(input);
  if (!parsed.ok) {
    process.stderr.write(`error: parse error: ${parsed.error}\n`);
    process.exit(1);
  }
  const errors = validatePlan(parsed.value);
  if (errors.length > 0) {
    for (const e of errors) process.stderr.write(`${formatError(e)}\n`);
    process.stderr.write(`error: ${errors.length} validation error(s)\n`);
    process.exit(1);
  }

  const projectDir = process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd();
  const cfg = loadConfig(projectDir);
  const plansRoot =
    opts.plansRoot ??
    (isAbsolute(cfg.plan_dir_root)
      ? cfg.plan_dir_root
      : join(projectDir, cfg.plan_dir_root));
  const today = opts.today ?? todayYymmddLocal();

  let target: string;
  try {
    target = materialize(parsed.value, plansRoot, today, cfg);
  } catch (e) {
    process.stderr.write(`error: ${(e as Error).message}\n`);
    process.exit(1);
  }

  process.stderr.write(`Wrote plan to ${target}\n`);
  process.stdout.write(`${target}\n`);
}

// Auto-detect whether `materialize` got a markdown plan or a legacy Plan
// JSON. Picks parser by the first non-whitespace character: `{` → JSON,
// otherwise markdown. The skill emits markdown now; JSON support stays
// for hand-written / scripted callers that pre-date the markdown flip.
// We strip a leading BOM here so the dispatch char check (`{`) doesn't
// misfire on a BOM-prefixed file; the parsers also strip BOM defensively
// for direct callers that bypass this dispatcher.
// The branch taken is prefixed onto any parse error so a typoed JSON
// doesn't surface a confusing "no plan title found" markdown message.
function parsePlanInput(input: string): ParseResult<Plan> {
  const noBom = input.charCodeAt(0) === 0xFEFF ? input.slice(1) : input;
  let i = 0;
  while (i < noBom.length && /\s/.test(noBom[i]!)) i++;
  if (i === noBom.length) {
    return { ok: false, error: "input is empty" };
  }
  if (noBom[i] === "{") {
    const r = parsePlanJson(noBom);
    return r.ok ? r : { ok: false, error: `JSON: ${r.error}` };
  }
  const r = parsePlanMarkdown(noBom);
  return r.ok ? r : { ok: false, error: `markdown: ${r.error}` };
}

await program.parseAsync();
