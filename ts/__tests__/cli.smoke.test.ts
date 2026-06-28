import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
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
  // Override HOME so the global-config layer (`~/.claude/plugins/jidoka/config.json`)
  // resolves to a missing path and falls back to defaults. Without this, smoke
  // tests pick up the developer's real config and become non-hermetic.
  const env = {
    ...process.env,
    HOME: "/nonexistent-jidoka-smoke-home",
    JIDOKA_NO_OPEN: "1",
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

describe("materialize", () => {
  it("accepts a file path and writes the plan dir", () => {
    const tmp = mkdtempSync(join(tmpdir(), "jidoka-smoke-mat-"));
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
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("accepts `-` for stdin", () => {
    const tmp = mkdtempSync(join(tmpdir(), "jidoka-smoke-stdin-"));
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
    const tmp = mkdtempSync(join(tmpdir(), "jidoka-smoke-md-"));
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
    const tmp = mkdtempSync(join(tmpdir(), "jidoka-smoke-bom-"));
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

  it("exits 1 with a clean error on missing file (no stack trace)", () => {
    const r = run(["materialize", "/no/such/file.json"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/^error: cannot read/);
    expect(r.stderr).not.toMatch(/at .* \(/); // no Node stack frame
  });
});

describe("paths", () => {
  it("prints the resolved convention paths as JSON (defaults)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "jidoka-smoke-paths-def-"));
    try {
      const r = run(["paths"], { env: { CLAUDE_PROJECT_DIR: tmp } });
      expect(r.status).toBe(0);
      expect(JSON.parse(r.stdout)).toEqual({
        root: "docs/exec-plans",
        backlog: "docs/exec-plans/backlog",
        active: "docs/exec-plans/active",
        completed: "docs/exec-plans/completed",
        reference: "docs/discussions",
      });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("honors a project .jidoka.json override", () => {
    const tmp = mkdtempSync(join(tmpdir(), "jidoka-smoke-paths-"));
    try {
      writeFileSync(
        join(tmp, ".jidoka.json"),
        JSON.stringify({ plan_dir_root: "notes/active", reference_dir: "wiki" }),
      );
      const r = run(["paths"], { env: { CLAUDE_PROJECT_DIR: tmp } });
      expect(r.status).toBe(0);
      const out = JSON.parse(r.stdout);
      expect(out.backlog).toBe("notes/backlog");
      expect(out.completed).toBe("notes/completed");
      expect(out.active).toBe("notes/active");
      expect(out.reference).toBe("wiki");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("--absolute joins paths under CLAUDE_PROJECT_DIR", () => {
    const tmp = mkdtempSync(join(tmpdir(), "jidoka-smoke-paths-abs-"));
    try {
      const r = run(["paths", "--absolute"], { env: { CLAUDE_PROJECT_DIR: tmp } });
      expect(r.status).toBe(0);
      const out = JSON.parse(r.stdout);
      expect(out.active).toBe(join(tmp, "docs/exec-plans/active"));
      expect(out.reference).toBe(join(tmp, "docs/discussions"));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("hook", () => {
  it("exits 0 even with malformed input", () => {
    const r = run(["hook"], { stdin: "not json" });
    // Hook must always exit 0 — non-zero would block ExitPlanMode permanently.
    expect(r.status).toBe(0);
  });

  it("exits 0 but denies loudly when tool_input.plan is absent", () => {
    const tmp = mkdtempSync(join(tmpdir(), "jidoka-smoke-hook-empty-"));
    try {
      const sessionId = `smoke-${Date.now()}`;
      const r = run(["hook"], {
        stdin: JSON.stringify({ session_id: sessionId }),
        env: { CLAUDE_PROJECT_DIR: tmp },
      });
      // Always exit 0 (a non-zero would block ExitPlanMode permanently) — but
      // the empty payload now surfaces a deny instead of vanishing silently.
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("deny");
      expect(r.stdout).toContain("no plan content reached the hook");
      expect(existsSync(join(tmp, "docs/exec-plans/active"))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("materializes from tool_input.planFilePath when plan is absent (file-based flow)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "jidoka-smoke-hook-pfp-"));
    try {
      const sessionId = `smoke-${Date.now()}`;
      const planFile = join(tmp, "plan.md");
      writeFileSync(planFile, "# File plan\n\n## Unit 01: Only\n\nSummary.\n");
      const r = run(["hook"], {
        stdin: JSON.stringify({
          session_id: sessionId,
          tool_name: "ExitPlanMode",
          tool_input: { allowedPrompts: [], planFilePath: planFile },
        }),
        env: { CLAUDE_PROJECT_DIR: tmp },
      });
      expect(r.status).toBe(0);
      expect(r.stdout).toBe(""); // no deny
      expect(r.stderr).toMatch(/Wrote plan to /);
      // A plan dir was materialized from the file's content (slug "file-plan").
      // The date prefix is dynamic, so match on the slug suffix.
      const active = join(tmp, "docs/exec-plans/active");
      expect(existsSync(active)).toBe(true);
      expect(readdirSync(active).some((d) => d.endsWith("-file-plan"))).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("materializes a plan dir from tool_input.plan markdown", () => {
    const tmp = mkdtempSync(join(tmpdir(), "jidoka-smoke-hook-ok-"));
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
    const tmp = mkdtempSync(join(tmpdir(), "jidoka-smoke-hook-bad-"));
    try {
      const sessionId = `smoke-${Date.now()}`;
      const r = run(["hook"], {
        stdin: JSON.stringify({
          session_id: sessionId,
          tool_input: { plan: "not a jidoka plan" },
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
