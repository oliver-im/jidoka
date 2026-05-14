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

  it("ships baseline tools and a unit-level pipeline matching today's behavior", () => {
    expect(defaultConfig.tools["anthropic-cr"]).toEqual({
      run: "/code-review:code-review",
    });
    expect(defaultConfig.tools.codex).toEqual({ run: "/codex:{op}" });
    expect(defaultConfig.tools.simplify).toEqual({ run: "/simplify" });
    expect(defaultConfig.review_pipelines.unit.steps).toEqual([
      { tool: "anthropic-cr" },
    ]);
    expect(defaultConfig.review_pipelines.plan.steps).toEqual([]);
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
    // Unknown keys are stripped; defaults survive.
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
        // Tool with an inline comment.
        "tools": {
          "anthropic-cr": { "run": "/code-review:code-review" }  // not a comment-in-string
        }
      }`,
    );
    const cfg = loadFromPaths(path, undefined);
    expect(cfg.plan_dir_root).toBe("commented/plans");
    expect(cfg.auto_open_browser).toBe(true);
    expect(cfg.tools["anthropic-cr"].run).toBe("/code-review:code-review");
    rmSync(dir, { recursive: true, force: true });
  });

  it("hydrates missing tools and review_pipelines from defaults", () => {
    const dir = makeTempDir("partial");
    const path = join(dir, "config.json");
    writeFileSync(
      path,
      JSON.stringify({ plan_dir_root: "custom" }),
    );
    const cfg = loadFromPaths(path, undefined);
    expect(cfg.plan_dir_root).toBe("custom");
    expect(cfg.tools).toEqual(defaultConfig.tools);
    expect(cfg.review_pipelines).toEqual(defaultConfig.review_pipelines);
    rmSync(dir, { recursive: true, force: true });
  });

  it("accepts a user-defined tool entry and a custom unit pipeline", () => {
    const dir = makeTempDir("custom-pipeline");
    const path = join(dir, "config.json");
    writeFileSync(
      path,
      JSON.stringify({
        tools: {
          "my-tool": { run: "/my:thing" },
        },
        review_pipelines: {
          unit: { steps: [{ tool: "my-tool", note: "smoke" }] },
          plan: { steps: [] },
        },
      }),
    );
    const cfg = loadFromPaths(path, undefined);
    expect(cfg.tools["my-tool"]).toEqual({ run: "/my:thing" });
    expect(cfg.review_pipelines.unit.steps).toEqual([
      { tool: "my-tool", note: "smoke" },
    ]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("falls back to defaults when a tool entry has a non-string run", () => {
    const dir = makeTempDir("bad-tool");
    const path = join(dir, "config.json");
    writeFileSync(
      path,
      JSON.stringify({ tools: { bad: { run: 42 } } }),
    );
    const cfg = loadFromPaths(path, undefined);
    // Zod rejects the whole config; we fall back to defaults rather than
    // hydrating a partial structure with one broken entry.
    expect(cfg).toEqual(defaultConfig);
    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects tools and review_pipelines as project overrides", () => {
    const dir = makeTempDir("scope");
    const path = join(dir, ".planview.json");
    writeFileSync(
      path,
      JSON.stringify({
        tools: { sneaky: { run: "/sneaky" } },
        review_pipelines: { unit: { steps: [] }, plan: { steps: [] } },
      }),
    );
    const cfg = loadFromPaths(undefined, path);
    // Project overrides for user-scope keys are dropped; defaults survive.
    expect(cfg.tools).toEqual(defaultConfig.tools);
    expect(cfg.review_pipelines).toEqual(defaultConfig.review_pipelines);
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
    expect(merged.tools).toEqual(defaultConfig.tools);
    expect(merged.review_pipelines).toEqual(defaultConfig.review_pipelines);
  });

  it("drops tools the user removed from cfg", () => {
    const base = {
      tools: {
        weird: { run: "/weird" },
        "anthropic-cr": { run: "/code-review:code-review" },
      },
    };
    const merged = mergeForWrite(base, defaultConfig);
    const tools = merged.tools as Record<string, unknown>;
    expect(tools.weird).toBeUndefined();
    expect("weird" in tools).toBe(false);
    expect(tools["anthropic-cr"]).toEqual({ run: "/code-review:code-review" });
  });

  it("preserves foreign sub-fields on a known tool entry", () => {
    const base = {
      tools: {
        codex: {
          run: "/codex:{op}",
          experimental_x: true,
        },
      },
    };
    const merged = mergeForWrite(base, defaultConfig);
    const tools = merged.tools as Record<string, Record<string, unknown>>;
    expect(tools.codex.experimental_x).toBe(true);
    expect(tools.codex.run).toBe("/codex:{op}");
  });

  it("purges the legacy fallback sub-field from a tool entry on write", () => {
    const base = {
      tools: {
        codex: { run: "/codex:{op}", fallback: "codex agent {op}" },
      },
    };
    const merged = mergeForWrite(base, defaultConfig);
    const tools = merged.tools as Record<string, Record<string, unknown>>;
    expect(tools.codex.run).toBe("/codex:{op}");
    expect(tools.codex.fallback).toBeUndefined();
    expect("fallback" in tools.codex).toBe(false);
  });

  it("preserves foreign scope keys on review_pipelines", () => {
    const base = {
      review_pipelines: {
        unit: { steps: [] },
        plan: { steps: [] },
        session: { steps: [{ tool: "anthropic-cr" }] },
      },
    };
    const merged = mergeForWrite(base, defaultConfig);
    const rp = merged.review_pipelines as Record<string, unknown>;
    expect(rp.session).toEqual({ steps: [{ tool: "anthropic-cr" }] });
    expect(rp.unit).toEqual(defaultConfig.review_pipelines.unit);
    expect(rp.plan).toEqual(defaultConfig.review_pipelines.plan);
  });
});
