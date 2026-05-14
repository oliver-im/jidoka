import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { Command } from "commander";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { describe } from "./describe.js";
import { showcase } from "./example.js";
import { renderTopologyHtml } from "./html.js";
import { runHook } from "./hook.js";
import {
  materialize,
  todayYymmddLocal,
  writePlanHtml,
} from "./materialize.js";
import { mermaid } from "./mermaid.js";
import { openBrowser } from "./output.js";
import { writeTempHtml } from "./output.js";
import { parsePlanMarkdown } from "./parse-markdown.js";
import { topologyJsonSchema } from "./schema.js";
import {
  type ParseResult,
  type Plan,
  parsePlanJson,
  parseTopologyJson,
  planSchema,
  serializeTopology,
  topologySchema,
} from "./types.js";
import { formatError, validatePlan, validateTopology } from "./validate.js";

declare const __PLANVIEW_VERSION__: string;

const program = new Command();
program
  .name("planview")
  .description(
    "Visualize multi-agent task decomposition; materialize plans on ExitPlanMode",
  )
  .version(__PLANVIEW_VERSION__, "-v, --version", "Show version number");

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
    "Materialize a plan markdown (or legacy Plan JSON) into <plan_dir_root>/<YYMMDD-N-slug>/ (use - for stdin)",
  )
  .option(
    "--plans-root <dir>",
    "Override the plans root (default: <CLAUDE_PROJECT_DIR or cwd>/<plan_dir_root>, layered config honored; plan_dir_root defaults to 'plan')",
  )
  .option("--today <yymmdd>", "Override today's date prefix")
  .action((file: string, opts: { plansRoot?: string; today?: string }) => {
    runMaterialize(file, opts);
  });

program
  .argument("[file]", "Topology JSON file to render (omit to read from stdin)")
  .option("--mermaid", "Output raw Mermaid graph definitions instead of HTML")
  .option("--plan <file>", "Plan markdown file for two-column layout")
  .option("--schema", "Dump topology JSON schema to stdout")
  .option(
    "--validate",
    "Validate JSON without rendering (exit 0 = valid, exit 1 = invalid)",
  )
  .option("--example", "Render the built-in showcase")
  .option("--json", "With --example, dump showcase JSON to stdout instead of rendering")
  .action(
    (
      file: string | undefined,
      opts: {
        mermaid?: boolean;
        plan?: string;
        schema?: boolean;
        validate?: boolean;
        example?: boolean;
        json?: boolean;
      },
    ) => {
      if (opts.schema) {
        process.stdout.write(JSON.stringify(topologyJsonSchema, null, 2) + "\n");
        return;
      }

      if (opts.example) {
        const t = showcase();
        if (opts.json) {
          process.stdout.write(
            JSON.stringify(serializeTopology(t), null, 2) + "\n",
          );
          return;
        }
        renderAndOpen(t, opts);
        return;
      }

      const json = file
        ? readFileSync(file, "utf8")
        : readFileSync(0, "utf8");

      if (opts.validate) {
        runValidate(json);
        return;
      }

      const topo = parseTopologyJson(json);
      if (!topo.ok) {
        process.stderr.write(`error: parse error: ${topo.error}\n`);
        process.exit(1);
      }
      const errors = validateTopology(topo.value);
      if (errors.length > 0) {
        for (const e of errors) process.stderr.write(`${formatError(e)}\n`);
        process.stderr.write(`error: ${errors.length} validation error(s)\n`);
        process.exit(1);
      }

      renderAndOpen(topo.value, opts);
    },
  );

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
    if (cfg.html_output) writePlanHtml(parsed.value, target);
  } catch (e) {
    process.stderr.write(`error: ${(e as Error).message}\n`);
    process.exit(1);
  }

  process.stderr.write(`Wrote plan to ${target}\n`);
  process.stdout.write(`${target}\n`);

  if (
    cfg.html_output &&
    cfg.auto_open_browser &&
    process.env["PLANVIEW_NO_OPEN"] === undefined
  ) {
    try {
      openBrowser(join(target, "overview.html"));
    } catch (e) {
      process.stderr.write(
        `warning: could not open browser: ${(e as Error).message}\n`,
      );
    }
  }
}

function runValidate(json: string): void {
  // Try Plan first; fall back to Topology if it doesn't match Plan shape.
  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(json);
  } catch (e) {
    process.stderr.write(`error: parse error: ${(e as Error).message}\n`);
    process.exit(1);
  }
  const planResult = planSchema.safeParse(parsedRaw);
  if (planResult.success) {
    const errors = validatePlan(planResult.data);
    if (errors.length === 0) process.exit(0);
    for (const e of errors) process.stdout.write(`${formatError(e)}\n`);
    process.stderr.write(`error: ${errors.length} validation error(s)\n`);
    process.exit(1);
  }
  const topoResult = topologySchema.safeParse(parsedRaw);
  if (topoResult.success) {
    const errors = validateTopology(topoResult.data);
    if (errors.length === 0) process.exit(0);
    for (const e of errors) process.stdout.write(`${formatError(e)}\n`);
    process.stderr.write(`error: ${errors.length} validation error(s)\n`);
    process.exit(1);
  }
  process.stderr.write(
    `error: parse error: ${formatZodIssues(planResult.error.issues)}\n`,
  );
  process.exit(1);
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

function formatZodIssues(issues: readonly z.core.$ZodIssue[]): string {
  if (issues.length === 0) return "(unknown)";
  const i = issues[0]!;
  const path = i.path.length > 0 ? i.path.join(".") : "<root>";
  return `${i.message} at ${path}`;
}

function renderAndOpen(
  topology: ReturnType<typeof showcase>,
  opts: { mermaid?: boolean; plan?: string },
): void {
  const graphs = mermaid(topology);
  if (opts.mermaid) {
    process.stdout.write(graphs.join("\n\n") + "\n");
    return;
  }
  const desc = describe(topology);
  const planMd = opts.plan ? readFileSync(opts.plan, "utf8") : undefined;
  const html = renderTopologyHtml(topology, graphs, desc, planMd);
  const path = writeTempHtml(html);
  process.stdout.write(`${path}\n`);
  if (process.env["PLANVIEW_NO_OPEN"] === undefined) openBrowser(path);
}

await program.parseAsync();
