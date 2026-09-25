import { afterEach, describe, expect, it, vi } from "vitest";
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
  it("increments past the highest existing entry", () => {
    const base = makeTempDir("inc");
    const plansRoot = join(base, "plan");
    mkdirSync(join(plansRoot, "260505-0-other"), { recursive: true });
    // Gaps (1 and 2 archived) and non-numeric names must not lower the max.
    mkdirSync(join(plansRoot, "260505-3-later"), { recursive: true });
    mkdirSync(join(plansRoot, "260505-draft-notes"), { recursive: true });
    const target = resolveTargetDir(samplePlan(), plansRoot, "260505");
    expect(target).toBe(join(plansRoot, "260505-4-pivot-renderer"));
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
    // The rendered default carries the reasoning-summary flag and the
    // `< /dev/null` stdin hang-guard verbatim, so the command surfaced to a
    // resuming agent is both detailed and hang-proof unattended.
    expect(progress).toContain(
      'codex exec -s read-only -c model_reasoning_summary=detailed "{focus}" < /dev/null',
    );
    expect(progress).not.toContain("## Git workflow");

    const u01 = readFileSync(join(target, "01-prep.md"), "utf8");
    expect(u01.startsWith("# Unit 01 — Title for 01-prep")).toBe(true);
    expect(u01).toContain("**Blocked by:** none");
    expect(u01).toContain("**Agents involved:** main only");
    expect(u01).toContain("## Review pipeline");
    // The default unit_review is a `claude -p` template, not a bare slash
    // command: `/code-review` is disable-model-invocation, so only the Bash
    // route is agent-reachable. It must render with its `exec` badge (the
    // agent runs it) and its `{diff_range}` placeholder intact — the renderer
    // records templates verbatim and never substitutes.
    expect(u01).toContain(
      "- [ ] `claude -p '/code-review {diff_range}' < /dev/null` — **exec**:",
    );

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
    expect(progress).toContain("Publishing is a separate, explicitly-requested step");
    expect(progress).not.toContain("git merge --no-ff");
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
  const originalTz = process.env["TZ"];
  afterEach(() => {
    vi.useRealTimers();
    if (originalTz === undefined) delete process.env["TZ"];
    else process.env["TZ"] = originalTz;
  });

  it("returns the zero-padded local date, not the UTC date", () => {
    // 01:30 on 5 Sep in Seoul is still 4 Sep in UTC.
    process.env["TZ"] = "Asia/Seoul";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-04T16:30:00Z"));
    expect(todayYymmddLocal()).toBe("260905");
  });
});
