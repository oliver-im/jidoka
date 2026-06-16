import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
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

describe("hook", () => {
  it("exits 0 even with malformed input", () => {
    const r = run(["hook"], { stdin: "not json" });
    // Hook must always exit 0 — non-zero would block ExitPlanMode permanently.
    expect(r.status).toBe(0);
  });

  it("exits 0 silently when tool_input.plan is absent", () => {
    const tmp = mkdtempSync(join(tmpdir(), "jidoka-smoke-hook-empty-"));
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
