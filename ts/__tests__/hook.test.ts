import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultConfig } from "../config.js";
import * as materializeModule from "../materialize.js";
import { __testing, type HookConfig } from "../hook.js";

// Route hook.ts's named import of materializeAt through a mocked (but
// actual-backed) module so `vi.spyOn(materializeModule, "materializeAt")`
// reliably intercepts the hook's call regardless of Vitest's ESM-transform
// internals. Spreading the original keeps every other export real.
vi.mock("../materialize.js", async (importOriginal) => ({
  ...(await importOriginal<typeof materializeModule>()),
}));

const { runWithInput, isValidSessionId } = __testing;

let counter = 0;
function makeTempDir(label: string): string {
  const path = join(
    tmpdir(),
    `planview-hook-test-${process.pid}-${Date.now()}-${counter++}-${label}`,
  );
  mkdirSync(path, { recursive: true });
  return path;
}

const testConfig = (project: string): HookConfig => ({
  today: "260505",
  projectDir: project,
  plansRoot: join(project, "notes/plan"),
  autoOpenBrowser: false,
  htmlOutput: true,
  cfg: defaultConfig,
});

// A real git repo (one commit, so HEAD exists for `git worktree add -b`),
// configured for git_workflow with the shipped default plan_dir_root.
function makeGitRepo(label: string): string {
  const repo = makeTempDir(label);
  const git = (...args: string[]): void => {
    execFileSync("git", ["-C", repo, ...args], { stdio: "ignore" });
  };
  git("init", "-q");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  git("config", "commit.gpgsign", "false");
  writeFileSync(join(repo, "README.md"), "# fixture\n");
  git("add", "README.md");
  git("commit", "-q", "-m", "init");
  git("branch", "-M", "main"); // deterministic trunk regardless of init default
  return repo;
}

// HookConfig anchored at a git repo with git_workflow on. plansRoot is the
// in-tree fallback location; the worktree path is derived from projectDir.
const gitWorkflowConfig = (repo: string): HookConfig => ({
  today: "260505",
  projectDir: repo,
  plansRoot: join(repo, defaultConfig.plan_dir_root),
  autoOpenBrowser: false,
  htmlOutput: false,
  cfg: { ...defaultConfig, git_workflow: true },
});

const validPlanMd = `# Hook test plan

## Unit 01: Only unit

Just a smoke test.
`;

const stdin = (sessionId: string, plan?: string): string =>
  JSON.stringify({
    session_id: sessionId,
    tool_name: "ExitPlanMode",
    tool_input: plan === undefined ? {} : { plan },
  });

let stdoutChunks: string[] = [];
let stderrChunks: string[] = [];
let stdoutSpy: ReturnType<typeof vi.spyOn> | undefined;
let stderrSpy: ReturnType<typeof vi.spyOn> | undefined;

beforeEach(() => {
  stdoutChunks = [];
  stderrChunks = [];
  stdoutSpy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: string | Uint8Array): boolean => {
      stdoutChunks.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    });
  stderrSpy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((chunk: string | Uint8Array): boolean => {
      stderrChunks.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    });
});

afterEach(() => {
  stdoutSpy?.mockRestore();
  stderrSpy?.mockRestore();
});

describe("isValidSessionId", () => {
  it("accepts well-formed ids", () => {
    expect(isValidSessionId("abc-123")).toBe(true);
    expect(isValidSessionId("test_session")).toBe(true);
    expect(isValidSessionId("ABC")).toBe(true);
    expect(isValidSessionId("a")).toBe(true);
  });
  it("rejects bad ids", () => {
    expect(isValidSessionId("")).toBe(false);
    expect(isValidSessionId("../etc/passwd")).toBe(false);
    expect(isValidSessionId("foo bar")).toBe(false);
    expect(isValidSessionId("a".repeat(129))).toBe(false);
  });
});

describe("runWithInput: missing or empty plan", () => {
  it("absent tool_input.plan exits silent (no deny, no plan dir)", () => {
    const project = makeTempDir("absent-proj");
    runWithInput(stdin(`absent-${process.pid}`), testConfig(project));
    expect(stdoutChunks.join("")).toBe("");
    expect(existsSync(join(project, "notes/plan"))).toBe(false);
    rmSync(project, { recursive: true, force: true });
  });

  it("empty plan string exits silent", () => {
    const project = makeTempDir("empty-proj");
    runWithInput(stdin(`empty-${process.pid}`, ""), testConfig(project));
    expect(stdoutChunks.join("")).toBe("");
    expect(existsSync(join(project, "notes/plan"))).toBe(false);
    rmSync(project, { recursive: true, force: true });
  });

  it("whitespace-only plan exits silent", () => {
    const project = makeTempDir("ws-proj");
    runWithInput(stdin(`ws-${process.pid}`, "   \n\n  "), testConfig(project));
    expect(stdoutChunks.join("")).toBe("");
    expect(existsSync(join(project, "notes/plan"))).toBe(false);
    rmSync(project, { recursive: true, force: true });
  });

  it("missing tool_input field entirely exits silent", () => {
    const project = makeTempDir("no-tool-input-proj");
    runWithInput(
      JSON.stringify({ session_id: `noti-${process.pid}` }),
      testConfig(project),
    );
    expect(stdoutChunks.join("")).toBe("");
    expect(existsSync(join(project, "notes/plan"))).toBe(false);
    rmSync(project, { recursive: true, force: true });
  });
});

describe("runWithInput: valid plan", () => {
  it("parses markdown, materializes, writes overview.html", () => {
    const project = makeTempDir("valid-proj");
    runWithInput(
      stdin(`valid-${process.pid}`, validPlanMd),
      testConfig(project),
    );

    const target = join(project, "notes/plan/260505-0-hook-test-plan");
    expect(existsSync(target)).toBe(true);
    expect(existsSync(join(target, "overview.md"))).toBe(true);
    expect(existsSync(join(target, "progress.md"))).toBe(true);
    expect(existsSync(join(target, "01-only-unit.md"))).toBe(true);
    expect(existsSync(join(target, "overview.html"))).toBe(true);
    rmSync(project, { recursive: true, force: true });
  });

  it("htmlOutput=false skips overview.html", () => {
    const project = makeTempDir("nohtml-proj");
    const cfg = { ...testConfig(project), htmlOutput: false };
    runWithInput(stdin(`nohtml-${process.pid}`, validPlanMd), cfg);
    const target = join(project, "notes/plan/260505-0-hook-test-plan");
    expect(existsSync(join(target, "overview.md"))).toBe(true);
    expect(existsSync(join(target, "overview.html"))).toBe(false);
    rmSync(project, { recursive: true, force: true });
  });

  it("unwraps a ```markdown fenced payload (the skill's documented emit shape)", () => {
    const project = makeTempDir("fenced-proj");
    const fenced = "```markdown\n" + validPlanMd + "```\n";
    runWithInput(stdin(`fenced-${process.pid}`, fenced), testConfig(project));
    // Without unwrap, the slug would be "markdown" (the leading fence line
    // becomes the title via extractTitle's fallback). With unwrap, the slug
    // comes from the inner H1 "Hook test plan".
    const target = join(project, "notes/plan/260505-0-hook-test-plan");
    expect(existsSync(target)).toBe(true);
    expect(existsSync(join(target, "01-only-unit.md"))).toBe(true);
    rmSync(project, { recursive: true, force: true });
  });

  it("plan with topology fence persists topology in unit md", () => {
    const project = makeTempDir("topo-proj");
    const planMd = `# Plan with topology

## Unit 01: Multi-agent

Dispatch a couple of agents.

\`\`\`topology
{
  "task_summary": "Build X",
  "execution_mode": "subagents",
  "agents": [
    {
      "id": "a",
      "role": "Do A",
      "model": "sonnet",
      "tools": [],
      "blocked_by": [],
      "background": false
    }
  ]
}
\`\`\`
`;
    runWithInput(stdin(`topo-${process.pid}`, planMd), testConfig(project));
    const unitMd = readFileSync(
      join(project, "notes/plan/260505-0-plan-with-topology/01-multi-agent.md"),
      "utf8",
    );
    // The renderer turns the typed topology into a Mermaid block — the raw
    // ```topology fence must not be re-rendered as JSON.
    expect(unitMd).not.toContain("```topology");
    expect(unitMd).toContain("```mermaid");
    rmSync(project, { recursive: true, force: true });
  });
});

describe("runWithInput: parse / validation errors", () => {
  it("malformed plan markdown emits deny", () => {
    const project = makeTempDir("malformed-proj");
    runWithInput(
      stdin(`malformed-${process.pid}`, "just some prose, no headings"),
      testConfig(project),
    );
    const out = stdoutChunks.join("");
    expect(out).toContain("PreToolUse");
    expect(out).toContain("deny");
    expect(out).toContain("cannot parse plan markdown");
    expect(existsSync(join(project, "notes/plan"))).toBe(false);
    rmSync(project, { recursive: true, force: true });
  });

  it("topology fence error surfaces as deny with units[k].topology prefix", () => {
    const project = makeTempDir("badtopo-proj");
    const planMd = `# Plan

## Unit 01: Bad fence

S.

\`\`\`topology
not json
\`\`\`
`;
    runWithInput(stdin(`badtopo-${process.pid}`, planMd), testConfig(project));
    const out = stdoutChunks.join("");
    expect(out).toContain("deny");
    expect(out).toContain("units[0].topology");
    expect(existsSync(join(project, "notes/plan"))).toBe(false);
    rmSync(project, { recursive: true, force: true });
  });

  it("validation error emits deny with reasoning", () => {
    const project = makeTempDir("inv-proj");
    // First unit has no body between heading and the next heading, so
    // validatePlan flags empty_unit_summary.
    const planMd = `# Bad plan

## Unit 01: First

## Unit 02: Second

Has summary.
`;
    runWithInput(stdin(`inv-${process.pid}`, planMd), testConfig(project));
    const out = stdoutChunks.join("");
    expect(out).toContain("Plan validation failed");
    expect(out).toContain("summary");
    expect(existsSync(join(project, "notes/plan"))).toBe(false);
    rmSync(project, { recursive: true, force: true });
  });
});

describe("runWithInput: filesystem behavior", () => {
  it("pre-existing N=0 dir does not get clobbered (counter advances)", () => {
    const project = makeTempDir("exists-proj");
    const oldTarget = join(project, "notes/plan/260505-0-hook-test-plan");
    mkdirSync(oldTarget, { recursive: true });
    runWithInput(
      stdin(`exists-${process.pid}`, validPlanMd),
      testConfig(project),
    );
    // Existing dir untouched.
    expect(existsSync(oldTarget)).toBe(true);
    expect(existsSync(join(oldTarget, "overview.html"))).toBe(false);
    // Fresh dir at counter=1.
    const newTarget = join(project, "notes/plan/260505-1-hook-test-plan");
    expect(existsSync(join(newTarget, "overview.md"))).toBe(true);
    rmSync(project, { recursive: true, force: true });
  });

  it("stale staging dir is replaced on success", () => {
    const project = makeTempDir("stale-proj");
    const session = `stale-${process.pid}`;
    const plansRoot = join(project, "notes/plan");
    mkdirSync(plansRoot, { recursive: true });
    const stale = join(plansRoot, `.planview-stage-${session}`);
    mkdirSync(stale, { recursive: true });
    writeFileSync(join(stale, "garbage.txt"), "leftover");
    runWithInput(stdin(session, validPlanMd), testConfig(project));
    const target = join(plansRoot, "260505-0-hook-test-plan");
    expect(existsSync(join(target, "overview.md"))).toBe(true);
    expect(existsSync(stale)).toBe(false);
    rmSync(project, { recursive: true, force: true });
  });
});

describe("runWithInput: bad input", () => {
  it("invalid JSON throws", () => {
    const project = makeTempDir("bad-proj");
    expect(() => runWithInput("not json", testConfig(project))).toThrow(
      /invalid hook input JSON/,
    );
    rmSync(project, { recursive: true, force: true });
  });

  it("missing session_id throws", () => {
    const project = makeTempDir("nosid-proj");
    expect(() =>
      runWithInput(
        `{"tool_input":{"plan":"# x\\n\\n## Unit 01: x\\n\\nx\\n"}}`,
        testConfig(project),
      ),
    ).toThrow(/invalid hook input JSON/);
    rmSync(project, { recursive: true, force: true });
  });

  it("invalid session_id throws", () => {
    const project = makeTempDir("bad-sid-proj");
    expect(() =>
      runWithInput(
        `{"session_id":"../etc/passwd"}`,
        testConfig(project),
      ),
    ).toThrow(/invalid session_id/);
    rmSync(project, { recursive: true, force: true });
  });
});

describe("runWithInput: git_workflow worktree scaffolding", () => {
  const planId0 = "260505-0-hook-test-plan";

  it("flag on in a git repo: creates the worktree + plan branch and materializes inside it", () => {
    const repo = makeGitRepo("wt-on");
    runWithInput(stdin(`wton-${process.pid}`, validPlanMd), gitWorkflowConfig(repo));

    const worktree = join(repo, "worktrees", planId0);
    expect(existsSync(worktree)).toBe(true);
    expect(
      existsSync(join(worktree, "docs/exec-plans/active", planId0, "overview.md")),
    ).toBe(true);

    // The plan branch exists...
    const branches = execFileSync(
      "git",
      ["-C", repo, "branch", "--list", `plan/${planId0}`],
      { encoding: "utf8" },
    );
    expect(branches).toContain(`plan/${planId0}`);
    // ...and the cd pointer is surfaced (the hook can't cd the agent itself).
    expect(stderrChunks.join("")).toContain(
      `worktrees/${planId0}/ — cd there to work`,
    );
    // Nothing landed at the in-tree fallback location.
    expect(existsSync(join(repo, "docs/exec-plans/active", planId0))).toBe(false);
    rmSync(repo, { recursive: true, force: true });
  });

  it("flag on but not a git repo: falls back to in-tree materialize, no worktree, exit 0", () => {
    const project = makeTempDir("wt-nogit");
    runWithInput(
      stdin(`wtnogit-${process.pid}`, validPlanMd),
      gitWorkflowConfig(project),
    );

    expect(existsSync(join(project, "worktrees"))).toBe(false);
    expect(
      existsSync(join(project, "docs/exec-plans/active", planId0, "overview.md")),
    ).toBe(true);
    expect(stderrChunks.join("")).toContain("isn't a git worktree");
    // No deny payload — a fallback is not a failure.
    expect(stdoutChunks.join("")).toBe("");
    rmSync(project, { recursive: true, force: true });
  });

  it("flag off in a git repo: materializes in-tree, never touches worktrees/", () => {
    const repo = makeGitRepo("wt-off");
    const cfg: HookConfig = {
      ...gitWorkflowConfig(repo),
      cfg: { ...defaultConfig, git_workflow: false },
    };
    runWithInput(stdin(`wtoff-${process.pid}`, validPlanMd), cfg);

    expect(existsSync(join(repo, "worktrees"))).toBe(false);
    expect(
      existsSync(join(repo, "docs/exec-plans/active", planId0, "overview.md")),
    ).toBe(true);
    rmSync(repo, { recursive: true, force: true });
  });

  it("invoked from inside an existing worktree: anchors at the main checkout, no nesting", () => {
    const repo = makeGitRepo("wt-nested");
    // A pre-existing worktree for another same-day plan.
    const existing = join(repo, "worktrees", "260505-0-existing");
    execFileSync(
      "git",
      ["-C", repo, "worktree", "add", existing, "-b", "plan/260505-0-existing"],
      { stdio: "ignore" },
    );

    // Invoke the hook as if /planview ran from *inside* that worktree.
    const cfg: HookConfig = {
      today: "260505",
      projectDir: existing,
      plansRoot: join(existing, defaultConfig.plan_dir_root),
      autoOpenBrowser: false,
      htmlOutput: false,
      cfg: { ...defaultConfig, git_workflow: true },
    };
    runWithInput(stdin(`wtnest-${process.pid}`, validPlanMd), cfg);

    // No worktree nested under the inner worktree...
    expect(existsSync(join(existing, "worktrees"))).toBe(false);
    // ...and the new one lands at the main root with the counter advanced
    // past the existing same-day plan (0 → 1).
    const planId1 = "260505-1-hook-test-plan";
    expect(
      existsSync(
        join(repo, "worktrees", planId1, "docs/exec-plans/active", planId1, "overview.md"),
      ),
    ).toBe(true);
    rmSync(repo, { recursive: true, force: true });
  });
});

describe("runWithInput: git_workflow hardening (codex review fixes)", () => {
  const planId0 = "260505-0-hook-test-plan";
  const head = (repo: string, ref: string): string =>
    execFileSync("git", ["-C", repo, "rev-parse", ref], {
      encoding: "utf8",
    }).trim();

  it("forks plan/<id> from the default branch even when the checkout is on a feature branch", () => {
    const repo = makeGitRepo("wt-base");
    const mainTip = head(repo, "main");
    // Move the main checkout onto a feature branch with an extra commit, so its
    // HEAD is no longer the trunk.
    execFileSync("git", ["-C", repo, "checkout", "-q", "-b", "feature"], {
      stdio: "ignore",
    });
    writeFileSync(join(repo, "f.txt"), "x\n");
    execFileSync("git", ["-C", repo, "add", "f.txt"], { stdio: "ignore" });
    execFileSync("git", ["-C", repo, "commit", "-q", "-m", "feature"], {
      stdio: "ignore",
    });
    const featureTip = head(repo, "feature");
    expect(featureTip).not.toBe(mainTip);

    runWithInput(
      stdin(`wtbase-${process.pid}`, validPlanMd),
      gitWorkflowConfig(repo),
    );

    // The plan branch must be based on main's tip, NOT the feature HEAD the
    // checkout happened to be on (else --no-ff would drag feature into main).
    expect(head(repo, `plan/${planId0}`)).toBe(mainTip);
    expect(head(repo, `plan/${planId0}`)).not.toBe(featureTip);
    rmSync(repo, { recursive: true, force: true });
  });

  it("denies (no silent in-tree fallback) when the plan branch already exists", () => {
    const repo = makeGitRepo("wt-deny");
    execFileSync("git", ["-C", repo, "branch", `plan/${planId0}`], {
      stdio: "ignore",
    });
    runWithInput(
      stdin(`wtdeny-${process.pid}`, validPlanMd),
      gitWorkflowConfig(repo),
    );

    const out = stdoutChunks.join("");
    expect(out).toContain("deny");
    expect(out).toContain("git worktree add failed");
    // The pure-worktree contract holds: nothing silently written in-tree, and
    // no orphan worktree.
    expect(existsSync(join(repo, "docs/exec-plans/active", planId0))).toBe(false);
    expect(existsSync(join(repo, "worktrees", planId0))).toBe(false);
    rmSync(repo, { recursive: true, force: true });
  });

  it("cleanupWorktree removes the worktree and its plan branch", () => {
    const repo = makeGitRepo("wt-cleanup");
    const id = "260505-9-cleanup-me";
    const wt = join(repo, "worktrees", id);
    execFileSync(
      "git",
      ["-C", repo, "worktree", "add", wt, "-b", `plan/${id}`, "main"],
      { stdio: "ignore" },
    );
    expect(existsSync(wt)).toBe(true);

    materializeModule.cleanupWorktree(repo, wt, `plan/${id}`);

    expect(existsSync(wt)).toBe(false);
    expect(
      execFileSync("git", ["-C", repo, "branch", "--list", `plan/${id}`], {
        encoding: "utf8",
      }).trim(),
    ).toBe("");
    rmSync(repo, { recursive: true, force: true });
  });

  it("rolls back the worktree + branch when materialize fails after setup", () => {
    const repo = makeGitRepo("wt-orphan");
    const spy = vi
      .spyOn(materializeModule, "materializeAt")
      .mockImplementation(() => {
        throw new Error("disk full");
      });
    try {
      runWithInput(
        stdin(`wtorphan-${process.pid}`, validPlanMd),
        gitWorkflowConfig(repo),
      );
    } finally {
      spy.mockRestore();
    }
    // The failure surfaced as a deny...
    expect(stdoutChunks.join("")).toContain("deny");
    // ...and left no orphan worktree or plan branch for the next run to skip.
    expect(existsSync(join(repo, "worktrees", planId0))).toBe(false);
    expect(
      execFileSync("git", ["-C", repo, "branch", "--list", `plan/${planId0}`], {
        encoding: "utf8",
      }).trim(),
    ).toBe("");
    rmSync(repo, { recursive: true, force: true });
  });
});
