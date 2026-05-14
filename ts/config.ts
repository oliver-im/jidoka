import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { z } from "zod";
import {
  type ReviewPipelines,
  type Tool,
  reviewPipelinesSchema,
  toolsSchema,
} from "./types.js";

export interface Config {
  plan_dir_root: string;
  auto_open_browser: boolean;
  html_output: boolean;
  plan_level_topology: boolean;
  tools: Record<string, Tool>;
  review_pipelines: ReviewPipelines;
}

export const defaultConfig: Config = {
  plan_dir_root: "plan",
  auto_open_browser: false,
  html_output: false,
  plan_level_topology: false,
  tools: {
    "anthropic-cr": { run: "/code-review:code-review" },
    codex: { run: "/codex:{op}" },
    simplify: { run: "/simplify" },
  },
  review_pipelines: {
    unit: { steps: [{ tool: "anthropic-cr" }] },
    plan: { steps: [] },
  },
};

const configSchema = z.object({
  plan_dir_root: z.string().default(defaultConfig.plan_dir_root),
  auto_open_browser: z.boolean().default(defaultConfig.auto_open_browser),
  html_output: z.boolean().default(defaultConfig.html_output),
  plan_level_topology: z.boolean().default(defaultConfig.plan_level_topology),
  tools: toolsSchema.default(defaultConfig.tools),
  review_pipelines: reviewPipelinesSchema.default(defaultConfig.review_pipelines),
});

export function globalConfigPath(): string | undefined {
  const home = homedir();
  if (!home) return undefined;
  return join(home, ".claude", "plugins", "planview", "config.json");
}

export function projectOverridePath(projectDir: string): string {
  return join(projectDir, ".planview.json");
}

/**
 * Loads layered config: defaults < global (`~/.claude/plugins/planview/config.json`)
 * < project (`<root>/.planview.json`, allow-listed keys only).
 *
 * Invalid JSON / unreadable files emit a stderr warning and fall back rather
 * than throw — the renderer must keep going so the hook stays exit-0.
 */
export function loadConfig(projectDir: string): Config {
  return loadFromPaths(globalConfigPath(), projectOverridePath(projectDir));
}

export function loadFromPaths(
  globalPath: string | undefined,
  projectPath: string | undefined,
): Config {
  let cfg: Config = { ...defaultConfig };

  if (globalPath !== undefined) {
    const raw = readJson(globalPath);
    if (raw !== undefined) {
      const parsed = configSchema.safeParse(raw);
      if (parsed.success) {
        cfg = parsed.data;
      } else {
        process.stderr.write(
          `planview: ignoring invalid global config at ${globalPath}: ${parsed.error.message}\n`,
        );
      }
    }
  }

  if (projectPath !== undefined) {
    const raw = readJson(projectPath);
    if (raw !== undefined) applyProjectOverrides(cfg, raw, projectPath);
  }

  return cfg;
}

function readJson(path: string): unknown {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return undefined;
    process.stderr.write(`planview: cannot read ${path}: ${err.message}\n`);
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    process.stderr.write(
      `planview: invalid JSON in ${path}: ${(e as Error).message}\n`,
    );
    return undefined;
  }
}

const PROJECT_OVERRIDE_KEYS = [
  "plan_dir_root",
  "auto_open_browser",
  "html_output",
] as const;

function applyProjectOverrides(cfg: Config, value: unknown, path: string): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    process.stderr.write(
      `planview: project override at ${path} must be a JSON object; ignoring\n`,
    );
    return;
  }

  for (const [key, val] of Object.entries(value)) {
    if (key === "plan_dir_root") {
      if (typeof val !== "string" || val.length === 0) {
        process.stderr.write(
          "planview: project override 'plan_dir_root' must be a non-empty string; ignoring\n",
        );
        continue;
      }
      const reason = validateProjectPlanDirRoot(val);
      if (reason !== undefined) {
        process.stderr.write(
          `planview: project override 'plan_dir_root' rejected (${reason}); ignoring\n`,
        );
        continue;
      }
      cfg.plan_dir_root = val;
    } else if (key === "auto_open_browser") {
      if (typeof val !== "boolean") {
        process.stderr.write(
          "planview: project override 'auto_open_browser' must be a boolean; ignoring\n",
        );
        continue;
      }
      cfg.auto_open_browser = val;
    } else if (key === "html_output") {
      if (typeof val !== "boolean") {
        process.stderr.write(
          "planview: project override 'html_output' must be a boolean; ignoring\n",
        );
        continue;
      }
      cfg.html_output = val;
    } else {
      process.stderr.write(
        `planview: project override key '${key}' is not allowed (allowed: ${PROJECT_OVERRIDE_KEYS.join(", ")}); ignoring\n`,
      );
    }
  }
}

/**
 * Per-project overrides may only set `plan_dir_root` to a project-relative
 * path that stays inside the project root. Returns an error reason or
 * undefined if valid.
 */
export function validateProjectPlanDirRoot(s: string): string | undefined {
  if (isAbsolute(s)) return "absolute paths are not allowed in project overrides";
  for (const part of s.split(/[\\/]/)) {
    if (part === "..") return "'..' segments are not allowed in project overrides";
  }
  return undefined;
}

/**
 * Reads the global config as a raw JSON value, preserving manually-added
 * keys. Used by `planview:configure` to round-trip without losing fields the
 * questionnaire doesn't know about.
 */
export function loadGlobalRaw(): Record<string, unknown> | undefined {
  const path = globalConfigPath();
  if (path === undefined) return undefined;
  const raw = readJson(path);
  if (raw === undefined) return undefined;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    return undefined;
  return raw as Record<string, unknown>;
}

/**
 * Merges known config fields into `base`, preserving unknown keys.
 *
 * Preservation reaches one level into `tools` (foreign sub-fields on each
 * tool entry that survived the configure pass) and into `review_pipelines`
 * (foreign scope keys alongside the standard `unit`/`plan`). Tool names
 * themselves are skill-managed — a tool absent from `cfg.tools` was removed
 * by the user and is dropped. The legacy `fallback` sub-field is purged
 * actively so the on-disk shape stays consistent with the current schema.
 * Step objects are array elements without stable identity, so foreign keys
 * inside individual steps are NOT preserved.
 */
export function mergeForWrite(
  base: Record<string, unknown> | undefined,
  cfg: Config,
): Record<string, unknown> {
  const out: Record<string, unknown> = base ? { ...base } : {};
  out.plan_dir_root = cfg.plan_dir_root;
  out.auto_open_browser = cfg.auto_open_browser;
  out.html_output = cfg.html_output;
  out.plan_level_topology = cfg.plan_level_topology;
  out.tools = mergeTools(base?.tools, cfg.tools);
  out.review_pipelines = mergeReviewPipelines(base?.review_pipelines, cfg.review_pipelines);
  return out;
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function mergeTools(
  base: unknown,
  cfg: Record<string, Tool>,
): Record<string, unknown> {
  const baseTools = isObject(base) ? base : {};
  const out: Record<string, unknown> = {};
  for (const [name, tool] of Object.entries(cfg)) {
    const baseEntry = isObject(baseTools[name]) ? baseTools[name] : {};
    const merged: Record<string, unknown> = { ...baseEntry, run: tool.run };
    delete merged.fallback;
    out[name] = merged;
  }
  return out;
}

function mergeReviewPipelines(
  base: unknown,
  cfg: ReviewPipelines,
): Record<string, unknown> {
  const baseRP = isObject(base) ? base : {};
  return { ...baseRP, unit: cfg.unit, plan: cfg.plan };
}
