import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Smoke tests for the shipped artifact. These execute `node dist/cli.js`
// against the bundled output, not the TS source — they're the regression
// gate that would have caught the --schema crash and broken `materialize -`
// that source-level tests missed.

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = join(here, "..", "..");
const cli = join(repoRoot, "dist", "cli.js");
const fixtures = join(here, "fixtures");

interface Result {
  stdout: string;
  stderr: string;
  status: number;
}

function run(args: string[], opts: { stdin?: string; env?: NodeJS.ProcessEnv } = {}): Result {
  // Override HOME so the global-config layer (`~/.claude/plugins/planview/config.json`)
  // resolves to a missing path and falls back to defaults. Without this, smoke
  // tests pick up the developer's real config and become non-hermetic.
  const env = {
    ...process.env,
    HOME: "/nonexistent-planview-smoke-home",
    PLANVIEW_NO_OPEN: "1",
    ...opts.env,
  };
  const result = spawnSync("node", [cli, ...args], {
    input: opts.stdin,
    env,
    encoding: "utf8",
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status ?? -1,
  };
}

describe("dist/cli.js bundle", () => {
  it("exists as an executable file", () => {
    expect(existsSync(cli)).toBe(true);
    const stat = statSync(cli);
    expect(stat.size).toBeGreaterThan(0);
  });
});

describe("--schema", () => {
  it("returns valid JSON Schema for Topology", () => {
    const r = run(["--schema"]);
    expect(r.status).toBe(0);
    const schema = JSON.parse(r.stdout);
    expect(schema.title).toBe("Topology");
    expect(schema.required).toEqual(["task_summary", "execution_mode", "agents"]);
    expect(schema.$defs?.Agent).toBeDefined();
    expect(schema.$defs.Agent.properties.id.pattern).toBe("^[a-zA-Z0-9_-]+$");
  });
});

describe("--example", () => {
  it("with --json prints showcase JSON", () => {
    const r = run(["--example", "--json"]);
    expect(r.status).toBe(0);
    const obj = JSON.parse(r.stdout);
    expect(typeof obj.task_summary).toBe("string");
    expect(Array.isArray(obj.agents)).toBe(true);
    expect(obj.agents.length).toBeGreaterThan(0);
  });

  it("renders an HTML file path on stdout", () => {
    const r = run(["--example"]);
    expect(r.status).toBe(0);
    const path = r.stdout.trim();
    expect(path).toMatch(/\.html$/);
    expect(existsSync(path)).toBe(true);
    const html = readFileSync(path, "utf8");
    expect(html).toContain("--haiku-fill");
    expect(html).toContain("planview-topology");
  });

  it("survives a missing browser opener (PATH stripped)", () => {
    // Without an error handler on the opener spawn, a missing
    // open/xdg-open/cmd would crash the parent with an unhandled async
    // ENOENT after rendering. Build env manually so PLANVIEW_NO_OPEN is
    // genuinely absent and the opener actually runs. Use process.execPath
    // so we can still locate node — the child inherits the empty PATH and
    // therefore can't locate open/xdg-open.
    const env: NodeJS.ProcessEnv = { ...process.env, PATH: "" };
    delete env.PLANVIEW_NO_OPEN;
    const result = spawnSync(process.execPath, [cli, "--example"], {
      env,
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stderr ?? "").toMatch(/could not open browser/);
  });
});

describe("--validate", () => {
  it("exits 0 on valid Topology via stdin", () => {
    const json = readFileSync(join(fixtures, "valid_minimal.json"), "utf8");
    const r = run(["--validate"], { stdin: json });
    expect(r.status).toBe(0);
  });

  it("exits 0 on valid Plan via stdin", () => {
    const json = readFileSync(join(fixtures, "valid_plan_minimal.json"), "utf8");
    const r = run(["--validate"], { stdin: json });
    expect(r.status).toBe(0);
  });

  it("exits 1 on a Topology with a cycle", () => {
    const json = readFileSync(join(fixtures, "invalid_cycle.json"), "utf8");
    const r = run(["--validate"], { stdin: json });
    expect(r.status).toBe(1);
  });
});

describe("materialize", () => {
  it("accepts a file path and writes the plan dir (no overview.html by default)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "planview-smoke-mat-"));
    try {
      const fixture = join(fixtures, "valid_plan_minimal.json");
      const r = run(
        ["materialize", fixture, "--plans-root", tmp, "--today", "260101"],
        { env: { CLAUDE_PROJECT_DIR: tmp } },
      );
      expect(r.status).toBe(0);
      const target = r.stdout.trim();
      expect(target.startsWith(tmp)).toBe(true);
      expect(existsSync(join(target, "overview.md"))).toBe(true);
      expect(existsSync(join(target, "progress.md"))).toBe(true);
      expect(existsSync(join(target, "overview.html"))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("accepts `-` for stdin", () => {
    const tmp = mkdtempSync(join(tmpdir(), "planview-smoke-stdin-"));
    try {
      const json = readFileSync(join(fixtures, "valid_plan_minimal.json"), "utf8");
      const r = run(
        ["materialize", "-", "--plans-root", tmp, "--today", "260101"],
        { stdin: json, env: { CLAUDE_PROJECT_DIR: tmp } },
      );
      expect(r.status).toBe(0);
      const target = r.stdout.trim();
      expect(existsSync(join(target, "overview.md"))).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("accepts a plan markdown file (auto-detected by leading `#`)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "planview-smoke-md-"));
    try {
      const md = "# Smoke plan\n\n## Unit 01: Only\n\nSummary.\n";
      const r = run(
        ["materialize", "-", "--plans-root", tmp, "--today", "260101"],
        { stdin: md, env: { CLAUDE_PROJECT_DIR: tmp } },
      );
      expect(r.status).toBe(0);
      const target = r.stdout.trim();
      expect(existsSync(join(target, "overview.md"))).toBe(true);
      expect(existsSync(join(target, "01-only.md"))).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("accepts a BOM-prefixed plan markdown via stdin", () => {
    const tmp = mkdtempSync(join(tmpdir(), "planview-smoke-bom-"));
    try {
      const md = "\uFEFF# Smoke plan\n\n## Unit 01: Only\n\nSummary.\n";
      const r = run(
        ["materialize", "-", "--plans-root", tmp, "--today", "260101"],
        { stdin: md, env: { CLAUDE_PROJECT_DIR: tmp } },
      );
      expect(r.status).toBe(0);
      const target = r.stdout.trim();
      expect(existsSync(join(target, "overview.md"))).toBe(true);
      expect(existsSync(join(target, "01-only.md"))).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("writes overview.html when project .planview.json sets html_output=true", () => {
    const project = mkdtempSync(join(tmpdir(), "planview-smoke-html-"));
    const plansRoot = mkdtempSync(join(tmpdir(), "planview-smoke-html-pr-"));
    try {
      writeFileSync(
        join(project, ".planview.json"),
        JSON.stringify({ html_output: true }),
      );
      const fixture = join(fixtures, "valid_plan_minimal.json");
      const r = run(
        ["materialize", fixture, "--plans-root", plansRoot, "--today", "260101"],
        { env: { CLAUDE_PROJECT_DIR: project, PLANVIEW_NO_OPEN: "1" } },
      );
      expect(r.status).toBe(0);
      const target = r.stdout.trim();
      expect(existsSync(join(target, "overview.html"))).toBe(true);
    } finally {
      rmSync(project, { recursive: true, force: true });
      rmSync(plansRoot, { recursive: true, force: true });
    }
  });

  it("exits 1 with a clean error on missing file (no stack trace)", () => {
    const r = run(["materialize", "/no/such/file.json"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/^error: cannot read/);
    expect(r.stderr).not.toMatch(/at .* \(/); // no Node stack frame
  });
});

describe("hook", () => {
  it("exits 0 even with malformed input", () => {
    const r = run(["hook"], { stdin: "not json" });
    // Hook must always exit 0 — non-zero would block ExitPlanMode permanently.
    expect(r.status).toBe(0);
  });

  it("exits 0 silently when tool_input.plan is absent", () => {
    const tmp = mkdtempSync(join(tmpdir(), "planview-smoke-hook-empty-"));
    try {
      const sessionId = `smoke-${Date.now()}`;
      const r = run(["hook"], {
        stdin: JSON.stringify({ session_id: sessionId }),
        env: { CLAUDE_PROJECT_DIR: tmp },
      });
      expect(r.status).toBe(0);
      expect(r.stdout).toBe("");
      expect(existsSync(join(tmp, "docs/exec-plans/active"))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("materializes a plan dir from tool_input.plan markdown", () => {
    const tmp = mkdtempSync(join(tmpdir(), "planview-smoke-hook-ok-"));
    try {
      const sessionId = `smoke-${Date.now()}`;
      const planMd = "# Smoke plan\n\n## Unit 01: Only\n\nSummary.\n";
      const r = run(["hook"], {
        stdin: JSON.stringify({
          session_id: sessionId,
          tool_name: "ExitPlanMode",
          tool_input: { plan: planMd },
        }),
        env: { CLAUDE_PROJECT_DIR: tmp },
      });
      expect(r.status).toBe(0);
      expect(r.stdout).toBe("");
      expect(r.stderr).toMatch(/Wrote plan to /);
      // Default plan_dir_root is `docs/exec-plans/active`; counter starts at 0.
      const planDir = join(tmp, "docs/exec-plans/active");
      expect(existsSync(planDir)).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("emits a deny payload when the plan markdown is malformed", () => {
    const tmp = mkdtempSync(join(tmpdir(), "planview-smoke-hook-bad-"));
    try {
      const sessionId = `smoke-${Date.now()}`;
      const r = run(["hook"], {
        stdin: JSON.stringify({
          session_id: sessionId,
          tool_input: { plan: "not a planview plan" },
        }),
        env: { CLAUDE_PROJECT_DIR: tmp },
      });
      expect(r.status).toBe(0);
      const out = JSON.parse(r.stdout);
      expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
