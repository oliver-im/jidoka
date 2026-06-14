import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import stripJsonComments from "strip-json-comments";
import { z } from "zod";
import { reviewStepSchema, type ReviewStep } from "./types.js";

export interface Config {
  plan_dir_root: string;
  auto_open_browser: boolean;
  html_output: boolean;
  plan_level_topology: boolean;
  git_workflow: boolean;
  // Review steps per stage. Each entry is a slash command (e.g. "/code-review")
  // or a tool-agnostic bash template `{ run, mode }` — see `reviewStepSchema`.
  pre_review: ReviewStep[];
  unit_review: ReviewStep[];
  plan_review: ReviewStep[];
}

export const defaultConfig: Config = {
  plan_dir_root: "docs/exec-plans/active",
  auto_open_browser: false,
  html_output: false,
  plan_level_topology: false,
  git_workflow: false,
  pre_review: ["/jidoka:pre-plan-review"],
  unit_review: ["/code-review"],
  plan_review: [],
};

const configSchema = z.object({
  plan_dir_root: z.string().default(defaultConfig.plan_dir_root),
  auto_open_browser: z.boolean().default(defaultConfig.auto_open_browser),
  html_output: z.boolean().default(defaultConfig.html_output),
  plan_level_topology: z.boolean().default(defaultConfig.plan_level_topology),
  git_workflow: z.boolean().default(defaultConfig.git_workflow),
  pre_review: z.array(reviewStepSchema).default(defaultConfig.pre_review),
  unit_review: z.array(reviewStepSchema).default(defaultConfig.unit_review),
  plan_review: z.array(reviewStepSchema).default(defaultConfig.plan_review),
});

export function globalConfigPath(): string | undefined {
  const home = homedir();
  if (!home) return undefined;
  return join(home, ".claude", "plugins", "jidoka", "config.json");
}

export function projectOverridePath(projectDir: string): string {
  return join(projectDir, ".jidoka.json");
}

/**
 * Loads layered config: defaults < global (`~/.claude/plugins/jidoka/config.json`)
 * < project (`<root>/.jidoka.json`, allow-listed keys only).
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
          `jidoka: ignoring invalid global config at ${globalPath}: ${parsed.error.message}\n`,
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
    process.stderr.write(`jidoka: cannot read ${path}: ${err.message}\n`);
    return undefined;
  }
  try {
    return JSON.parse(stripJsonComments(raw));
  } catch (e) {
    process.stderr.write(
      `jidoka: invalid JSON in ${path}: ${(e as Error).message}\n`,
    );
    return undefined;
  }
}

const PROJECT_OVERRIDE_KEYS = [
  "plan_dir_root",
  "auto_open_browser",
  "html_output",
  "git_workflow",
] as const;

function applyProjectOverrides(cfg: Config, value: unknown, path: string): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    process.stderr.write(
      `jidoka: project override at ${path} must be a JSON object; ignoring\n`,
    );
    return;
  }

  for (const [key, val] of Object.entries(value)) {
    if (key === "plan_dir_root") {
      if (typeof val !== "string" || val.length === 0) {
        process.stderr.write(
          "jidoka: project override 'plan_dir_root' must be a non-empty string; ignoring\n",
        );
        continue;
      }
      const reason = validateProjectPlanDirRoot(val);
      if (reason !== undefined) {
        process.stderr.write(
          `jidoka: project override 'plan_dir_root' rejected (${reason}); ignoring\n`,
        );
        continue;
      }
      cfg.plan_dir_root = val;
    } else if (key === "auto_open_browser") {
      if (typeof val !== "boolean") {
        process.stderr.write(
          "jidoka: project override 'auto_open_browser' must be a boolean; ignoring\n",
        );
        continue;
      }
      cfg.auto_open_browser = val;
    } else if (key === "html_output") {
      if (typeof val !== "boolean") {
        process.stderr.write(
          "jidoka: project override 'html_output' must be a boolean; ignoring\n",
        );
        continue;
      }
      cfg.html_output = val;
    } else if (key === "git_workflow") {
      if (typeof val !== "boolean") {
        process.stderr.write(
          "jidoka: project override 'git_workflow' must be a boolean; ignoring\n",
        );
        continue;
      }
      cfg.git_workflow = val;
    } else {
      process.stderr.write(
        `jidoka: project override key '${key}' is not allowed (allowed: ${PROJECT_OVERRIDE_KEYS.join(", ")}); ignoring\n`,
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
 * keys. Used by `jidoka:setup` when overwriting an existing file, so
 * fields the questionnaire doesn't know about survive the round-trip.
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
  out.git_workflow = cfg.git_workflow;
  out.pre_review = [...cfg.pre_review];
  out.unit_review = [...cfg.unit_review];
  out.plan_review = [...cfg.plan_review];
  return out;
}
