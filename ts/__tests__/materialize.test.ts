import { describe, expect, it } from "vitest";
import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Config, defaultConfig } from "../config.js";
import {
  MaterializeError,
  materialize,
  materializeAt,
  resolveTargetDir,
  todayYymmddLocal,
} from "../materialize.js";
import type { Plan, Unit } from "../types.js";

let tempDirCounter = 0;
function makeTempDir(label: string): string {
  const path = join(
    tmpdir(),
    `jidoka-mat-test-${process.pid}-${Date.now()}-${tempDirCounter++}-${label}`,
  );
  mkdirSync(path, { recursive: true });
  return path;
}

const minimalUnit = (id: string, blockedBy: string[] = []): Unit => ({
  id,
  title: `Title for ${id}`,
  summary: `Summary for ${id}.`,
  blocked_by: blockedBy,
  body_markdown: `## Tasks\n\nDo ${id}.\n`,
});

const cfgWithUnitReview = (unit_review: string[]): Config => ({
  ...defaultConfig,
  unit_review,
});

const cfgWithPlanReview = (plan_review: string[]): Config => ({
  ...defaultConfig,
  plan_review,
});

const cfgWithPreReview = (pre_review: string[]): Config => ({
  ...defaultConfig,
  pre_review,
});

const samplePlan = (): Plan => ({
  task_summary: "Pivot the renderer",
  slug: "pivot-renderer",
  units: [
    minimalUnit("01-prep"),
    minimalUnit("02-implement", ["01-prep"]),
  ],
});

describe("resolveTargetDir", () => {
  it("uses 0 when plans dir is empty", () => {
    const base = makeTempDir("empty");
    const plansRoot = join(base, "plan");
    mkdirSync(plansRoot, { recursive: true });
    const target = resolveTargetDir(samplePlan(), plansRoot, "260505");
    expect(target.endsWith("260505-0-pivot-renderer")).toBe(true);
    rmSync(base, { recursive: true, force: true });
  });

  it("increments past existing entries", () => {
    const base = makeTempDir("inc");
    const plansRoot = join(base, "plan");
    mkdirSync(join(plansRoot, "260505-0-other"), { recursive: true });
    const target = resolveTargetDir(samplePlan(), plansRoot, "260505");
    expect(target.endsWith("260505-1-pivot-renderer")).toBe(true);
    rmSync(base, { recursive: true, force: true });
  });

  it("ignores entries in sibling dirs outside plansRoot", () => {
    const base = makeTempDir("siblings");
    const plansRoot = join(base, "plan");
    mkdirSync(plansRoot, { recursive: true });
    mkdirSync(join(base, "research"), { recursive: true });
    writeFileSync(join(base, "research", "260505-2-foo.md"), "x");
    mkdirSync(join(base, "done", "plan", "260505-1-bar"), { recursive: true });

    const target = resolveTargetDir(samplePlan(), plansRoot, "260505");
    expect(target.endsWith("260505-0-pivot-renderer")).toBe(true);
    rmSync(base, { recursive: true, force: true });
  });

  it("ignores other dates", () => {
    const base = makeTempDir("dates");
    const plansRoot = join(base, "plan");
    mkdirSync(join(plansRoot, "260504-9-yesterday"), { recursive: true });
    const target = resolveTargetDir(samplePlan(), plansRoot, "260505");
    expect(target.endsWith("260505-0-pivot-renderer")).toBe(true);
    rmSync(base, { recursive: true, force: true });
  });
});

describe("materialize", () => {
  it("writes overview.md, progress.md, and per-unit md", () => {
    const base = makeTempDir("write");
    const plansRoot = join(base, "plan");
    mkdirSync(plansRoot, { recursive: true });

    const plan = samplePlan();
    const target = materialize(plan, plansRoot, "260505", defaultConfig);

    expect(target.endsWith("260505-0-pivot-renderer")).toBe(true);

    const overview = readFileSync(join(target, "overview.md"), "utf8");
    expect(overview).toContain("Pivot the renderer");
    expect(overview).toContain("| 01 | Title for 01-prep |");
    expect(overview).toContain("| 02 | Title for 02-implement | 01 |");

    const progress = readFileSync(join(target, "progress.md"), "utf8");
    expect(progress).toContain("**Cursor:** 01-prep");
    expect(progress).toContain("## Pre-execution review");
    expect(progress).toContain("- [ ] `/jidoka:pre-plan-review`");
    expect(progress).toContain("## Plan-level review");
    expect(progress).toContain('codex exec -s read-only "{focus}"');
    expect(progress).not.toContain("## Git workflow");

    const u01 = readFileSync(join(target, "01-prep.md"), "utf8");
    expect(u01.startsWith("# Unit 01 — Title for 01-prep")).toBe(true);
    expect(u01).toContain("**Blocked by:** none");
    expect(u01).toContain("**Agents involved:** main only");
    expect(u01).toContain("## Review pipeline");
    expect(u01).toContain("- [ ] `/code-review`");

    rmSync(base, { recursive: true, force: true });
  });

  it("renders the ## Git workflow block into progress.md when enabled", () => {
    const base = makeTempDir("gitwf");
    const plansRoot = join(base, "plan");
    mkdirSync(plansRoot, { recursive: true });
    const cfg = { ...defaultConfig, git_workflow: true };
    const target = materialize(samplePlan(), plansRoot, "260505", cfg);
    const progress = readFileSync(join(target, "progress.md"), "utf8");
    expect(progress).toContain("## Git workflow");
    expect(progress).toContain("worktrees/260505-0-pivot-renderer/");
    expect(progress).toContain("plan/260505-0-pivot-renderer");
    expect(progress).toContain("git merge --no-ff plan/260505-0-pivot-renderer");
    rmSync(base, { recursive: true, force: true });
  });

  it("renders unit pipeline with multiple slash commands", () => {
    const base = makeTempDir("multi");
    const plansRoot = join(base, "plan");
    mkdirSync(plansRoot, { recursive: true });
    const cfg = cfgWithUnitReview([
      "/code-review:code-review",
      "/codex:review",
      "/simplify",
    ]);
    const target = materialize(samplePlan(), plansRoot, "260505", cfg);
    const u01 = readFileSync(join(target, "01-prep.md"), "utf8");
    expect(u01).toContain("- [ ] `/code-review:code-review`");
    expect(u01).toContain("- [ ] `/codex:review`");
    expect(u01).toContain("- [ ] `/simplify`");
    rmSync(base, { recursive: true, force: true });
  });

  it("renders plan-level review", () => {
    const base = makeTempDir("plan-review");
    const plansRoot = join(base, "plan");
    mkdirSync(plansRoot, { recursive: true });
    const cfg = cfgWithPlanReview([
      "/code-review:code-review",
      "/codex:adversarial-review",
    ]);
    const target = materialize(samplePlan(), plansRoot, "260505", cfg);
    const progress = readFileSync(join(target, "progress.md"), "utf8");
    expect(progress).toContain("## Plan-level review");
    expect(progress).toContain(
      "After the last unit's review lands and is committed",
    );
    expect(progress).toContain("- [ ] `/code-review:code-review`");
    expect(progress).toContain("- [ ] `/codex:adversarial-review`");
    rmSync(base, { recursive: true, force: true });
  });

  it("renders pre-execution review with configured commands", () => {
    const base = makeTempDir("pre-review");
    const plansRoot = join(base, "plan");
    mkdirSync(plansRoot, { recursive: true });
    const cfg = cfgWithPreReview([
      "/jidoka:pre-plan-review",
      "/codex:adversarial-review",
    ]);
    const target = materialize(samplePlan(), plansRoot, "260505", cfg);
    const progress = readFileSync(join(target, "progress.md"), "utf8");
    expect(progress).toContain("## Pre-execution review");
    expect(progress).toContain("before starting Unit 01");
    expect(progress).toContain("- [ ] `/jidoka:pre-plan-review`");
    expect(progress).toContain("- [ ] `/codex:adversarial-review`");
    rmSync(base, { recursive: true, force: true });
  });

  it("carries template review steps through resolvePipelines and renders their mode", () => {
    const base = makeTempDir("template-steps");
    const plansRoot = join(base, "plan");
    mkdirSync(plansRoot, { recursive: true });
    const cfg: Config = {
      ...defaultConfig,
      unit_review: [{ run: "codex exec review {focus}", mode: "exec" }],
      plan_review: [{ run: "codex exec --base {base} {diff_range}", mode: "print" }],
    };
    const target = materialize(samplePlan(), plansRoot, "260505", cfg);

    const u01 = readFileSync(join(target, "01-prep.md"), "utf8");
    expect(u01).toContain(
      "- [ ] `codex exec review {focus}` — **exec**",
    );
    expect(u01).toContain("the resuming agent runs this via the Bash tool");

    const progress = readFileSync(join(target, "progress.md"), "utf8");
    expect(progress).toContain(
      "- [ ] `codex exec --base {base} {diff_range}` — **print**",
    );
    expect(progress).toContain("substitutes their placeholders");
    rmSync(base, { recursive: true, force: true });
  });

  it("renders empty pre-execution review as opt-out placeholder", () => {
    const base = makeTempDir("pre-review-empty");
    const plansRoot = join(base, "plan");
    mkdirSync(plansRoot, { recursive: true });
    const cfg = cfgWithPreReview([]);
    const target = materialize(samplePlan(), plansRoot, "260505", cfg);
    const progress = readFileSync(join(target, "progress.md"), "utf8");
    expect(progress).toContain("## Pre-execution review");
    expect(progress).toContain("_No pre-execution review configured.");
    rmSync(base, { recursive: true, force: true });
  });

  it("places pre-execution review before plan-level review in progress.md", () => {
    const base = makeTempDir("pre-order");
    const plansRoot = join(base, "plan");
    mkdirSync(plansRoot, { recursive: true });
    const target = materialize(samplePlan(), plansRoot, "260505", defaultConfig);
    const progress = readFileSync(join(target, "progress.md"), "utf8");
    const preIdx = progress.indexOf("## Pre-execution review");
    const planIdx = progress.indexOf("## Plan-level review");
    expect(preIdx).toBeGreaterThan(-1);
    expect(planIdx).toBeGreaterThan(-1);
    expect(preIdx).toBeLessThan(planIdx);
    rmSync(base, { recursive: true, force: true });
  });

  it("materializeAt errors when target exists", () => {
    const base = makeTempDir("collision");
    const target = join(base, "260505-0-pivot-renderer");
    mkdirSync(target, { recursive: true });
    expect(() => materializeAt(samplePlan(), target, defaultConfig)).toThrow(
      MaterializeError,
    );
    try {
      materializeAt(samplePlan(), target, defaultConfig);
    } catch (e) {
      expect(e).toBeInstanceOf(MaterializeError);
      expect((e as MaterializeError).kind).toBe("target_dir_exists");
    }
    rmSync(base, { recursive: true, force: true });
  });
});

describe("todayYymmddLocal", () => {
  it("returns 6-digit string", () => {
    const s = todayYymmddLocal();
    expect(s).toMatch(/^\d{6}$/);
  });
});
