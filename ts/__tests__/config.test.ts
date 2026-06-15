import { describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  defaultConfig,
  loadFromPaths,
  mergeForWrite,
  validateProjectPlanDirRoot,
} from "../config.js";
import { reviewStepLabel, reviewStepSchema } from "../types.js";

let counter = 0;
function makeTempDir(label: string): string {
  const path = join(
    tmpdir(),
    `jidoka-cfg-test-${process.pid}-${Date.now()}-${counter++}-${label}`,
  );
  mkdirSync(path, { recursive: true });
  return path;
}

describe("defaults", () => {
  it("match spec", () => {
    expect(defaultConfig.plan_dir_root).toBe("docs/exec-plans/active");
    expect(defaultConfig.git_workflow).toBe(false);
  });

  it("ships a unit-level pipeline matching today's behavior", () => {
    expect(defaultConfig.unit_review).toEqual(["/code-review"]);
    expect(defaultConfig.plan_review).toEqual([]);
  });

  it("ships a pre-execution review defaulting to /jidoka:pre-plan-review", () => {
    expect(defaultConfig.pre_review).toEqual(["/jidoka:pre-plan-review"]);
  });
});

describe("loadFromPaths", () => {
  it("falls back to defaults when both files missing", () => {
    const cfg = loadFromPaths(undefined, undefined);
    expect(cfg).toEqual(defaultConfig);
  });

  it("reads global config", () => {
    const dir = makeTempDir("global");
    const path = join(dir, "config.json");
    writeFileSync(path, JSON.stringify({ plan_dir_root: "custom/plans" }));
    const cfg = loadFromPaths(path, undefined);
    expect(cfg.plan_dir_root).toBe("custom/plans");
    rmSync(dir, { recursive: true, force: true });
  });

  it("project override accepts plan_dir_root, git_workflow", () => {
    const dir = makeTempDir("proj");
    const path = join(dir, ".jidoka.json");
    writeFileSync(
      path,
      JSON.stringify({
        plan_dir_root: "docs/plans",
        git_workflow: true,
      }),
    );
    const cfg = loadFromPaths(undefined, path);
    expect(cfg.plan_dir_root).toBe("docs/plans");
    expect(cfg.git_workflow).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("project override rejects unknown keys", () => {
    const dir = makeTempDir("unknown");
    const path = join(dir, ".jidoka.json");
    writeFileSync(
      path,
      JSON.stringify({
        unknown_setting: 99,
        another_unknown: "warn",
      }),
    );
    const cfg = loadFromPaths(undefined, path);
    expect(cfg).toEqual(defaultConfig);
    rmSync(dir, { recursive: true, force: true });
  });

  it("project override rejects non-boolean git_workflow", () => {
    const dir = makeTempDir("gwbad");
    const path = join(dir, ".jidoka.json");
    writeFileSync(path, JSON.stringify({ git_workflow: "yes" }));
    const cfg = loadFromPaths(undefined, path);
    expect(cfg.git_workflow).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects absolute plan_dir_root in project override", () => {
    const dir = makeTempDir("abs");
    const path = join(dir, ".jidoka.json");
    writeFileSync(path, JSON.stringify({ plan_dir_root: "/etc/foo" }));
    const cfg = loadFromPaths(undefined, path);
    expect(cfg.plan_dir_root).toBe("docs/exec-plans/active");
    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects parent traversal in project override", () => {
    const dir = makeTempDir("traversal");
    const path = join(dir, ".jidoka.json");
    writeFileSync(path, JSON.stringify({ plan_dir_root: "../escape" }));
    const cfg = loadFromPaths(undefined, path);
    expect(cfg.plan_dir_root).toBe("docs/exec-plans/active");
    rmSync(dir, { recursive: true, force: true });
  });

  it("falls back to defaults on invalid global JSON", () => {
    const dir = makeTempDir("invalid");
    const path = join(dir, "config.json");
    writeFileSync(path, "{not json");
    const cfg = loadFromPaths(path, undefined);
    expect(cfg).toEqual(defaultConfig);
    rmSync(dir, { recursive: true, force: true });
  });

  it("parses JSONC — strips // and /* */ comments before parsing", () => {
    const dir = makeTempDir("jsonc");
    const path = join(dir, "config.json");
    writeFileSync(
      path,
      `{
        // Top-level scalar comment.
        "plan_dir_root": "commented/plans",
        /* Block comment
           spanning multiple lines. */
        "git_workflow": true,
        // Inline comment near a string with a slash inside.
        "unit_review": [ "/code-review:code-review" ]  // not a comment-in-string
      }`,
    );
    const cfg = loadFromPaths(path, undefined);
    expect(cfg.plan_dir_root).toBe("commented/plans");
    expect(cfg.git_workflow).toBe(true);
    expect(cfg.unit_review).toEqual(["/code-review:code-review"]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("hydrates missing unit_review, plan_review, pre_review from defaults", () => {
    const dir = makeTempDir("partial");
    const path = join(dir, "config.json");
    writeFileSync(path, JSON.stringify({ plan_dir_root: "custom" }));
    const cfg = loadFromPaths(path, undefined);
    expect(cfg.plan_dir_root).toBe("custom");
    expect(cfg.unit_review).toEqual(defaultConfig.unit_review);
    expect(cfg.plan_review).toEqual(defaultConfig.plan_review);
    expect(cfg.pre_review).toEqual(defaultConfig.pre_review);
    rmSync(dir, { recursive: true, force: true });
  });

  it("accepts a custom pre_review list of slash commands", () => {
    const dir = makeTempDir("custom-pre-review");
    const path = join(dir, "config.json");
    writeFileSync(
      path,
      JSON.stringify({
        pre_review: ["/jidoka:pre-plan-review", "/codex:adversarial-review"],
      }),
    );
    const cfg = loadFromPaths(path, undefined);
    expect(cfg.pre_review).toEqual([
      "/jidoka:pre-plan-review",
      "/codex:adversarial-review",
    ]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("accepts an explicitly empty pre_review (opt-out)", () => {
    const dir = makeTempDir("empty-pre-review");
    const path = join(dir, "config.json");
    writeFileSync(path, JSON.stringify({ pre_review: [] }));
    const cfg = loadFromPaths(path, undefined);
    expect(cfg.pre_review).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("accepts a custom unit pipeline of slash commands", () => {
    const dir = makeTempDir("custom-pipeline");
    const path = join(dir, "config.json");
    writeFileSync(
      path,
      JSON.stringify({
        unit_review: ["/code-review:code-review", "/codex:review"],
        plan_review: ["/codex:adversarial-review"],
      }),
    );
    const cfg = loadFromPaths(path, undefined);
    expect(cfg.unit_review).toEqual([
      "/code-review:code-review",
      "/codex:review",
    ]);
    expect(cfg.plan_review).toEqual(["/codex:adversarial-review"]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("falls back to defaults when a review entry is a bare non-slash string", () => {
    // A bare string that is neither a "/" slash command nor a { run, mode }
    // template object is rejected by the union, so the whole config falls back.
    const dir = makeTempDir("bad-review");
    const path = join(dir, "config.json");
    writeFileSync(path, JSON.stringify({ unit_review: ["not-a-slash"] }));
    const cfg = loadFromPaths(path, undefined);
    expect(cfg).toEqual(defaultConfig);
    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects unit_review / plan_review / pre_review as project overrides", () => {
    const dir = makeTempDir("scope");
    const path = join(dir, ".jidoka.json");
    writeFileSync(
      path,
      JSON.stringify({
        unit_review: ["/sneaky"],
        plan_review: ["/sneakier"],
        pre_review: ["/sneakiest"],
      }),
    );
    const cfg = loadFromPaths(undefined, path);
    expect(cfg.unit_review).toEqual(defaultConfig.unit_review);
    expect(cfg.plan_review).toEqual(defaultConfig.plan_review);
    expect(cfg.pre_review).toEqual(defaultConfig.pre_review);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("validateProjectPlanDirRoot", () => {
  it("accepts nested relative paths", () => {
    expect(validateProjectPlanDirRoot("docs/plans/v2")).toBeUndefined();
  });
  it("rejects absolute", () => {
    expect(validateProjectPlanDirRoot("/etc/x")).toMatch(/absolute/);
  });
  it("rejects '..'", () => {
    expect(validateProjectPlanDirRoot("../escape")).toMatch(/'\.\.'/);
    expect(validateProjectPlanDirRoot("a/../b")).toMatch(/'\.\.'/);
  });
});

describe("mergeForWrite", () => {
  it("preserves unknown keys", () => {
    const base = {
      plan_dir_root: "old",
      experimental_feature: "preserve-me",
    };
    const cfg = { ...defaultConfig, plan_dir_root: "new" };
    const merged = mergeForWrite(base, cfg);
    expect(merged.plan_dir_root).toBe("new");
    expect(merged.experimental_feature).toBe("preserve-me");
  });

  it("starts from empty when base undefined", () => {
    const merged = mergeForWrite(undefined, defaultConfig);
    expect(merged.plan_dir_root).toBe("docs/exec-plans/active");
    expect(merged.unit_review).toEqual(defaultConfig.unit_review);
    expect(merged.plan_review).toEqual(defaultConfig.plan_review);
    expect(merged.pre_review).toEqual(defaultConfig.pre_review);
    expect(merged.git_workflow).toBe(false);
  });

  it("writes git_workflow from cfg, overwriting a stale base value", () => {
    // Guards the round-trip: mergeForWrite must emit git_workflow explicitly,
    // or a setup rewrite would silently drop a user's git_workflow: true.
    const base = { git_workflow: false, experimental: "keep" };
    const cfg = { ...defaultConfig, git_workflow: true };
    const merged = mergeForWrite(base, cfg);
    expect(merged.git_workflow).toBe(true);
    expect(merged.experimental).toBe("keep");
  });

  it("overwrites stale unit_review / plan_review / pre_review from base", () => {
    const base = {
      unit_review: ["/old:command"],
      plan_review: ["/old:plan-command"],
      pre_review: ["/old:pre-command"],
    };
    const cfg = {
      ...defaultConfig,
      unit_review: ["/new:command"],
      plan_review: [],
      pre_review: ["/new:pre-command"],
    };
    const merged = mergeForWrite(base, cfg);
    expect(merged.unit_review).toEqual(["/new:command"]);
    expect(merged.plan_review).toEqual([]);
    expect(merged.pre_review).toEqual(["/new:pre-command"]);
  });

  it("round-trips hand-written object-form review steps (load → mergeForWrite)", () => {
    const dir = makeTempDir("roundtrip-template");
    const path = join(dir, "config.json");
    // A user hand-edits the global config to add a { run, mode } template
    // alongside a slash command, plus a bare template (no mode).
    writeFileSync(
      path,
      `{
        "unit_review": [
          { "run": "codex exec review {focus}", "mode": "exec" },
          "/code-review"
        ],
        "plan_review": [
          { "run": "git diff {diff_range} | codex exec \\"{focus}\\"" }
        ]
      }`,
    );
    // Load validates the union and defaults the bare template's mode to print.
    const cfg = loadFromPaths(path, undefined);
    expect(cfg.unit_review).toEqual([
      { run: "codex exec review {focus}", mode: "exec" },
      "/code-review",
    ]);
    expect(cfg.plan_review).toEqual([
      { run: 'git diff {diff_range} | codex exec "{focus}"', mode: "print" },
    ]);
    // A setup rewrite must carry the object form back out — not flatten it to a
    // label, drop the mode, or lose the slash/template mix.
    const merged = mergeForWrite({ unit_review: ["/stale"] }, cfg);
    expect(merged.unit_review).toEqual(cfg.unit_review);
    expect(merged.plan_review).toEqual(cfg.plan_review);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("reviewStepSchema", () => {
  it("accepts a slash command unchanged", () => {
    const r = reviewStepSchema.safeParse("/code-review");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe("/code-review");
  });

  it("accepts a template object and defaults mode to print", () => {
    const r = reviewStepSchema.safeParse({ run: "codex exec {plan_dir}" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toEqual({ run: "codex exec {plan_dir}", mode: "print" });
    }
  });

  it("accepts an explicit exec mode", () => {
    const r = reviewStepSchema.safeParse({ run: "codex exec x", mode: "exec" });
    expect(r.success).toBe(true);
    if (r.success && typeof r.data !== "string") {
      expect(r.data.mode).toBe("exec");
    }
  });

  it("rejects a bare (non-slash) string", () => {
    expect(reviewStepSchema.safeParse("not-a-slash").success).toBe(false);
  });

  it("rejects an empty template run", () => {
    expect(reviewStepSchema.safeParse({ run: "" }).success).toBe(false);
  });

  it("rejects an unknown mode", () => {
    expect(reviewStepSchema.safeParse({ run: "x", mode: "auto" }).success).toBe(
      false,
    );
  });

  it("rejects unknown keys on a template (strict)", () => {
    expect(
      reviewStepSchema.safeParse({ run: "x", focus: "races" }).success,
    ).toBe(false);
  });
});

describe("reviewStepLabel", () => {
  it("labels a slash command as itself", () => {
    expect(reviewStepLabel("/code-review")).toBe("/code-review");
  });
  it("labels a template as its run text", () => {
    expect(reviewStepLabel({ run: "codex exec x", mode: "exec" })).toBe(
      "codex exec x",
    );
  });
});

describe("loadFromPaths — template review steps", () => {
  it("loads a template step with explicit mode", () => {
    const dir = makeTempDir("tmpl");
    const path = join(dir, "config.json");
    writeFileSync(
      path,
      JSON.stringify({
        plan_review: [{ run: "codex exec {diff_range}", mode: "exec" }],
      }),
    );
    const cfg = loadFromPaths(path, undefined);
    expect(cfg.plan_review).toEqual([
      { run: "codex exec {diff_range}", mode: "exec" },
    ]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("defaults a template step's mode to print", () => {
    const dir = makeTempDir("tmpl-default");
    const path = join(dir, "config.json");
    writeFileSync(path, JSON.stringify({ plan_review: [{ run: "codex exec x" }] }));
    const cfg = loadFromPaths(path, undefined);
    expect(cfg.plan_review).toEqual([{ run: "codex exec x", mode: "print" }]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("accepts a mix of slash commands and templates in one stage", () => {
    const dir = makeTempDir("mixed");
    const path = join(dir, "config.json");
    writeFileSync(
      path,
      JSON.stringify({
        pre_review: [
          "/jidoka:pre-plan-review",
          { run: "agent -p --mode ask {plan_dir}", mode: "exec" },
        ],
      }),
    );
    const cfg = loadFromPaths(path, undefined);
    expect(cfg.pre_review).toEqual([
      "/jidoka:pre-plan-review",
      { run: "agent -p --mode ask {plan_dir}", mode: "exec" },
    ]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("falls back to defaults on a malformed template (empty run)", () => {
    const dir = makeTempDir("bad-tmpl");
    const path = join(dir, "config.json");
    writeFileSync(path, JSON.stringify({ unit_review: [{ run: "", mode: "exec" }] }));
    const cfg = loadFromPaths(path, undefined);
    expect(cfg).toEqual(defaultConfig);
    rmSync(dir, { recursive: true, force: true });
  });
});
