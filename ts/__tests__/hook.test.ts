import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import { __testing, type HookConfig } from "../hook.js";

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
  plansRoot: join(project, "notes/plan"),
  autoOpenBrowser: false,
  htmlOutput: true,
  cfg: defaultConfig,
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
