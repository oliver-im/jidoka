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

let counter = 0;
function makeTempDir(label: string): string {
  const path = join(
    tmpdir(),
    `planview-cfg-test-${process.pid}-${Date.now()}-${counter++}-${label}`,
  );
  mkdirSync(path, { recursive: true });
  return path;
}

describe("defaults", () => {
  it("match spec", () => {
    expect(defaultConfig.plan_dir_root).toBe("plan");
    expect(defaultConfig.auto_open_browser).toBe(false);
    expect(defaultConfig.html_output).toBe(false);
    expect(defaultConfig.plan_level_topology).toBe(false);
  });

  it("ships a unit-level pipeline matching today's behavior", () => {
    expect(defaultConfig.unit_review).toEqual(["/code-review:code-review"]);
    expect(defaultConfig.plan_review).toEqual([]);
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
    expect(cfg.auto_open_browser).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it("project override accepts plan_dir_root, auto_open_browser, html_output", () => {
    const dir = makeTempDir("proj");
    const path = join(dir, ".planview.json");
    writeFileSync(
      path,
      JSON.stringify({
        plan_dir_root: "docs/plans",
        auto_open_browser: true,
        html_output: true,
      }),
    );
    const cfg = loadFromPaths(undefined, path);
    expect(cfg.plan_dir_root).toBe("docs/plans");
    expect(cfg.auto_open_browser).toBe(true);
    expect(cfg.html_output).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("project override rejects unknown keys", () => {
    const dir = makeTempDir("unknown");
    const path = join(dir, ".planview.json");
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

  it("project override rejects non-boolean for auto_open_browser/html_output", () => {
    const dir = makeTempDir("nonbool");
    const path = join(dir, ".planview.json");
    writeFileSync(
      path,
      JSON.stringify({
        auto_open_browser: "yes",
        html_output: 1,
      }),
    );
    const cfg = loadFromPaths(undefined, path);
    expect(cfg.auto_open_browser).toBe(false);
    expect(cfg.html_output).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects absolute plan_dir_root in project override", () => {
    const dir = makeTempDir("abs");
    const path = join(dir, ".planview.json");
    writeFileSync(path, JSON.stringify({ plan_dir_root: "/etc/foo" }));
    const cfg = loadFromPaths(undefined, path);
    expect(cfg.plan_dir_root).toBe("plan");
    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects parent traversal in project override", () => {
    const dir = makeTempDir("traversal");
    const path = join(dir, ".planview.json");
    writeFileSync(path, JSON.stringify({ plan_dir_root: "../escape" }));
    const cfg = loadFromPaths(undefined, path);
    expect(cfg.plan_dir_root).toBe("plan");
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
        "auto_open_browser": true,
        // Inline comment near a string with a slash inside.
        "unit_review": [ "/code-review:code-review" ]  // not a comment-in-string
      }`,
    );
    const cfg = loadFromPaths(path, undefined);
    expect(cfg.plan_dir_root).toBe("commented/plans");
    expect(cfg.auto_open_browser).toBe(true);
    expect(cfg.unit_review).toEqual(["/code-review:code-review"]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("hydrates missing unit_review and plan_review from defaults", () => {
    const dir = makeTempDir("partial");
    const path = join(dir, "config.json");
    writeFileSync(path, JSON.stringify({ plan_dir_root: "custom" }));
    const cfg = loadFromPaths(path, undefined);
    expect(cfg.plan_dir_root).toBe("custom");
    expect(cfg.unit_review).toEqual(defaultConfig.unit_review);
    expect(cfg.plan_review).toEqual(defaultConfig.plan_review);
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

  it("falls back to defaults when a review entry isn't a slash command", () => {
    const dir = makeTempDir("bad-review");
    const path = join(dir, "config.json");
    writeFileSync(path, JSON.stringify({ unit_review: ["not-a-slash"] }));
    const cfg = loadFromPaths(path, undefined);
    expect(cfg).toEqual(defaultConfig);
    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects unit_review / plan_review as project overrides", () => {
    const dir = makeTempDir("scope");
    const path = join(dir, ".planview.json");
    writeFileSync(
      path,
      JSON.stringify({
        unit_review: ["/sneaky"],
        plan_review: ["/sneakier"],
      }),
    );
    const cfg = loadFromPaths(undefined, path);
    expect(cfg.unit_review).toEqual(defaultConfig.unit_review);
    expect(cfg.plan_review).toEqual(defaultConfig.plan_review);
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
    expect(merged.auto_open_browser).toBe(false);
  });

  it("starts from empty when base undefined", () => {
    const merged = mergeForWrite(undefined, defaultConfig);
    expect(merged.plan_dir_root).toBe("plan");
    expect(merged.unit_review).toEqual(defaultConfig.unit_review);
    expect(merged.plan_review).toEqual(defaultConfig.plan_review);
  });

  it("overwrites stale unit_review / plan_review from base", () => {
    const base = {
      unit_review: ["/old:command"],
      plan_review: ["/old:plan-command"],
    };
    const cfg = {
      ...defaultConfig,
      unit_review: ["/new:command"],
      plan_review: [],
    };
    const merged = mergeForWrite(base, cfg);
    expect(merged.unit_review).toEqual(["/new:command"]);
    expect(merged.plan_review).toEqual([]);
  });
});
