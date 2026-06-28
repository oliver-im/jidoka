# Developer Guide: Building the Renderer

Self-contained reference for rebuilding jidoka in any language. See [Data Model](data-model.md) for the typed shapes (Plan + Unit) and the plan markdown surface, and [Agent Guide](agent-guide.md) for the skill's behavior and heuristics.

## System Architecture

Two components with a strict boundary between them.

```
User types /jidoka <task>
      |
      v
+- SKILL (inline, no context: fork) ----------------+
|                                                    |
|  LLM analyzes task -> produces plan markdown       |
|    (# Title H1 + ## Unit NN: headings + bodies)    |
|  Writes plan to plan file, calls ExitPlanMode      |
+------------------+--------------------------------+
                   |
                   v  (harness reads plan file -> tool_input.plan)
+------------------v--------------------------------+
|  RENDERER (bundled dist/cli.js, hook mode)         |
|                                                    |
|  Reads tool_input.plan from PreToolUse stdin       |
|  parse_plan_markdown -> validate_plan ->           |
|  materialize_at writes <plan_dir_root>/            |
|     <YYMMDD-N-slug>/{overview,progress,0N-*.md}    |
+----------------------------------------------------+
```

### Skill (SKILL.md)

Runs **inline** in the planning agent's context — no `context: fork`, so its instructions compose with plan mode's native prompt rather than running in an isolated subagent. One-shot generator: analyzes the task, produces **plan markdown**, writes it to the plan-mode plan file, then calls `ExitPlanMode`. Running inline, the skill sees the live plan-mode conversation (the task as it developed, codebase notes, the user back-and-forth) — exactly the raw material decomposition needs.

The skill handles everything requiring LLM judgment: task analysis, unit decomposition, body prose. It writes only the plan-mode plan file (the one sanctioned plan-mode write), never calls the renderer, never executes the plan.

### Renderer (ts/)

Deterministic CLI. Handles everything mechanical: parsing, validation, plan dir materialization. Never calls the LLM.

```
plan markdown (from PreToolUse stdin's tool_input.plan, or from a file/stdin)
  -> parse_plan_markdown      (extracts title/units/summaries/bodies)
  -> validate_plan            (Plan rules; see Validation Rules)
  -> materialize:
       resolve_target_dir -> materialize_at
         -> build_overview_md / build_progress_md / build_unit_md
            -> atomic_write per file
```

### The Contracts

**Hook contract** (the primary path):

```
agent writes the plan to the plan-mode plan file, then ExitPlanMode fires
  -> harness reads that file, injects its content as tool_input.plan (+ planFilePath)
  -> hook reads stdin, takes tool_input.plan (or reads planFilePath if absent)
  -> parse_plan_markdown + validate_plan
  -> materializes <project>/<plan_dir_root>/<YYMMDD-N-slug>/
  -> exits 0
```

**Direct CLI contract** (kept for one-off / scripted use):

```bash
jidoka materialize <plan.md>            # parses markdown, writes plan dir
jidoka materialize - < plan.md          # same, via stdin
jidoka materialize <legacy-plan.json>   # legacy Plan JSON also accepted (auto-detected)
```

The skill never invokes the binary. Renderer-skill separation is preserved.

## Validation Rules

The validator enforces one rule set over the top-level Plan. `validate_plan` runs it over the parsed plan.

### Plan Rules

1. `task_summary` must be a non-empty string
2. `slug` must match `^[a-z0-9-]+$`, length 1–60, no leading/trailing hyphen
3. `units` must be a non-empty array
4. Each unit's `id` must match `^[0-9]{2}-[a-z0-9-]+$`
5. Unit `id` must be unique within the plan
6. Each unit's `title` and `summary` must be non-empty
7. `blocked_by` references must resolve to existing unit IDs in the same plan
8. No unit can block itself
9. The unit dependency graph must be acyclic — checked via DFS with a three-color recursion stack

## CLI Interface

```
Usage:
  jidoka materialize <plan.md>       Materialize a plan markdown into <plan_dir_root>/
  jidoka materialize - < plan.md     Materialize plan markdown from stdin
                                       (legacy Plan JSON is also accepted; format auto-detected)
  jidoka hook                        Process ExitPlanMode hook from stdin
  jidoka paths                       Print the resolved convention paths as JSON

Options:
  -h, --help          Show this help message
  -v, --version       Show version number

Materialize subcommand options:
  --plans-root <dir>  Override <project>/<plan_dir_root>
  --today <YYMMDD>    Override the date prefix (default: today's local date)
```

### Mode Details

- **Materialize mode** (`jidoka materialize`): Read a plan from file (or stdin when the file argument is `-`), auto-detect markdown vs legacy JSON by the first non-whitespace character (`{` → JSON, otherwise markdown), validate, write `<plan_dir_root>/<YYMMDD-N-slug>/{overview,progress,0N-*}.md`. Plans root resolves from `$CLAUDE_PROJECT_DIR/<plan_dir_root>` (PWD fallback with stderr warning). Exit 0 on success, 1 on error.
- **Hook mode** (`jidoka hook`): Process ExitPlanMode PreToolUse hook input from stdin. See [Hook Integration](#hook-integration) for full details. Always exits 0 (never blocks ExitPlanMode).
- **Paths mode** (`jidoka paths`): Print the resolved convention layout — `root`/`backlog`/`active`/`completed`/`reference` — as JSON, honoring layered config, so skills/docs read one resolver (`resolveConventionPaths`) instead of hardcoding `docs/exec-plans/...`. `active` *is* `plan_dir_root`; `backlog`/`completed` are its fixed-named siblings; `reference` is `reference_dir`. `--absolute` joins each project-relative path with `$CLAUDE_PROJECT_DIR` (PWD fallback). Read-only; never consulted by `materialize` (which stays convention-agnostic).

### Environment Variables

| Variable | Effect |
|---|---|
| `CLAUDE_PROJECT_DIR` | Project root used to resolve `<project>/<plan_dir_root>/`; PWD fallback with a stderr warning when unset (claude-code issue [#22343](https://github.com/anthropics/claude-code/issues/22343)) |

## Configuration

The renderer reads a layered config: built-in defaults < `~/.claude/plugins/jidoka/config.json` (global) < `<project>/.jidoka.json` (project). Defined in `ts/config.ts`; loaded via `loadConfig(projectDir)` and threaded into the hook + materialize CLI paths.

| Key | Type | Default | Project override? | Notes |
|---|---|---|---|---|
| `plan_dir_root` | string | `docs/exec-plans/active` | yes (relative paths only, no `..`) | Where plan dirs land (the convention's `active/`). Project paths are resolved against `$CLAUDE_PROJECT_DIR`. `backlog`/`completed` derive as its siblings via `jidoka paths`; the leaf names are fixed (not configurable). |
| `reference_dir` | string | `docs/discussions` | yes (relative paths only, no `..`) | The design-discussions reference area (the "what to build / why"), **outside** the lifecycle convention. Surfaced by `jidoka paths`; never consulted by `materialize`. |
| `git_workflow` | bool | `false` | yes | When on, renders a `## Git workflow` block (the worktree-per-plan / branch-per-unit reminder) into `progress.md`. Shipped off — OSS opt-in; a committed `.jidoka.json` opts a repo in. |
| `pre_review` | `ReviewStep[]` | `["/jidoka:pre-plan-review"]` | **no** | Pre-execution review steps. Each is a slash command or a `{ run, mode }` template (`ReviewStep`; see [data-model.md](data-model.md#review-commands)). Project-override **excluded** — global-config-only, the boundary that makes `exec` safe (a cloned repo's `.jidoka.json` can't inject shell). |
| `unit_review` | `ReviewStep[]` | `["/code-review"]` | **no** | Per-unit review steps, same `ReviewStep` shape and global-only boundary. |
| `plan_review` | `ReviewStep[]` | `[{ run: "codex exec -s read-only \"{focus}\"", mode: "exec" }]` | **no** | Plan-level review steps (ships on — a `codex exec` template, agent-run via `/jidoka:plan-review-prompt`; set `[]` to disable), same `ReviewStep` shape and global-only boundary. |

### Loader behavior

- The global file is parsed as **JSONC** — `//` and `/* */` comments are stripped before `JSON.parse`. `jidoka:setup` writes an annotated template by default, so the in-file comments are the primary "what does this key do" reference.
- Missing files are not errors: layer falls through silently.
- Invalid JSON or shape mismatch on the global file: stderr warning, fall back to defaults.
- Project file may only set the keys marked above. Other keys are warn-and-ignored. Non-boolean values for the boolean keys are warn-and-ignored. `plan_dir_root` and `reference_dir` strings are validated (`isAbsolute` and `..` segments rejected) before being applied.
- `resolveConventionPaths(cfg)` is the one place that knows the convention's `{backlog,active,completed}` layout (and the separate `reference` area); it derives `backlog`/`completed` as siblings of `plan_dir_root` and is surfaced by `jidoka paths`. Keeping it out of `materialize` preserves the renderer's deliberate convention-agnosticism (see [Daily counter](#daily-counter)).
- `mergeForWrite(base, cfg)` encodes the round-trip invariant for overwriting an existing global file — known keys are re-emitted while any manually added keys are preserved. It's exercised by the config tests; `jidoka:setup` edits the file directly rather than shelling into the CLI.

### Daily counter

`materialize.ts` picks the next `N` as max + 1 over entries matching `^<today>-(\d+)-`. The normal in-tree path (`resolveTargetDir`) scans `plansRoot` only; with `git_workflow` on, `setupWorktree` instead scans the main checkout's `worktrees/` **and** in-tree `active/` (so same-day worktree plans still increment). Other dirs — `backlog/`, `completed/`, an archived-plan tree — are deliberately **not** scanned: the user's filing convention does not belong in the code, and the convention's *shared-with-`backlog/`* counter is upheld by the agent at id-assignment time, not by the renderer. An `N` freed by an entry since moved out of the scanned set (e.g. a plan archived to `completed/`) can therefore reappear; rename at move-time if it bothers you.

### Skills

One skill fronts the config UX (interactive by design — it uses `AskUserQuestion`, unlike `/jidoka`, which runs one-shot and never prompts):

- `jidoka:setup` — first-run Q&A walkthrough that writes the global file. Triggered by phrases like "set up jidoka". Handles only the scalar knobs; the review steps (`pre_review`, `unit_review`, `plan_review` — each a slash command or `{ run, mode }` template) are written at their defaults and hand-edited in the JSON afterward (see README → Editing review commands). The hook re-validates on next plan-mode use, so no separate validator is needed.

## Plugin Manifest

The plugin ships with `.claude-plugin/plugin.json` (metadata), `.claude-plugin/marketplace.json` (local-install marketplace), and `hooks/hooks.json` (the ExitPlanMode hook). Skills live at `skills/<name>/SKILL.md` and are auto-discovered by the plugin loader, so installing the plugin IS the prompt-injection — no per-project AGENTS.md needed.

```json
{
  "name": "jidoka",
  "version": "0.3.0",
  "description": "Materialize multi-unit plans …"
}
```

The hook in `hooks/hooks.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "ExitPlanMode",
        "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PLUGIN_ROOT/dist/cli.js\" hook" }]
      }
    ]
  }
}
```

`$CLAUDE_PLUGIN_ROOT` expands to the plugin install path, so no `jidoka` binary needs to be on `$PATH`. The bundle always exits 0 internally — there is no `|| true` shell guard, since a non-zero exit from `dist/cli.js` would indicate a bug we want to surface, not silently swallow. Hook errors land on stderr via the run() wrapper.

**Wiring the hook into a non-plugin project.** Enabling the plugin installs the hook automatically. To add it to a project that doesn't use the plugin, drop the same `{ "hooks": { "PreToolUse": [...] } }` block shown above into that project's `.claude/settings.json`, replacing `$CLAUDE_PLUGIN_ROOT` with the path to your jidoka checkout (the symlinked CLI from §Making the binary available also works: `"command": "jidoka hook"`).

## Hook Integration

### Why PreToolUse, Not PostToolUse

This is an empirical discovery about Claude Code's hook system. PostToolUse fires after the user has already approved or rejected the tool call:

| ExitPlanMode outcome | Plan data in payload? | Useful for review? |
|---|---|---|
| Approved | Yes (`tool_response.plan`, `tool_response.filePath`) | No — user already decided |
| Rejected | No (plain error string) | N/A — no data to show |

PostToolUse is structurally incompatible with "review before approval."

### Timeline

PreToolUse fires before the user sees the approval dialog:

1. Agent (in plan mode) crystallizes a plan, runs `/jidoka`
2. Skill writes the plan markdown to the plan-mode plan file
3. Main agent calls `ExitPlanMode`; the harness reads the plan file and puts its content in `tool_input.plan` (+ `planFilePath`)
4. **>> PreToolUse hook fires** (synchronous, blocks until complete)
5. Hook reads stdin, takes the markdown from `tool_input.plan` (or reads `planFilePath`), parses + validates it
6. Hook materializes `<project>/<plan_dir_root>/<YYMMDD-N-slug>/`
7. User sees ExitPlanMode approval dialog in CLI
8. User reviews the materialized plan + units in their editor while deciding
9. User approves or rejects

### Hook Flow

```
Hook receives stdin JSON: { "session_id": "...", "tool_name": "ExitPlanMode",
                            "tool_input": { "plan": "...", "planFilePath": "..." } }
  |
  +-- Validate session_id (path-safe)
  |
  +-- Resolve plan markdown: tool_input.plan, else read tool_input.planFilePath off disk
  |
  +- [both channels empty / file unreadable]
  |   +-- deny LOUDLY ("no plan content reached the hook ...") -> exit 0
  |
  +- [plan markdown resolved]
      +-- parse_plan_markdown -> error? -> deny with parser reason -> exit 0
      +-- validate_plan       -> errors? -> deny with reasons      -> exit 0
      +-- resolve_target_dir
      +-- target dir already exists? -> deny "Plan dir <path> already exists" -> exit 0
      +-- stage in <plansRoot>/.jidoka-stage-<sessionId>/
      +-- materialize_at
      +-- atomic rename staging -> target ; cleanup staging on any failure -> exit 0
```

There is no marker file, deny-loop, or `hook_behavior` knob — `ExitPlanMode` + `PreToolUse` shipped in Claude Code v2.1.85 (2026-03-26), four days after this project started; the original `/tmp/jidoka-{session_id}.json` ferry was forced by that timing and is now obsolete. The current harness sources the markdown from the plan-mode plan file (injected into `tool_input.plan`, with `planFilePath` as a path fallback). The hook resolves the plan from one of those; if neither yields content, it denies loudly so a broken wiring surfaces immediately instead of silently materializing nothing.

### Deny payloads

When parsing or validation fails, the hook returns:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Plan validation failed: ..."
  }
}
```

The agent sees the deny with the specific reason and can fix the plan + retry ExitPlanMode. Validation-error denies, parse-error denies, and "target dir exists" denies all use specific messages so the agent has actionable context.

### Critical: Always Exit 0

PreToolUse hooks block the tool if they return a non-zero exit code. The hook must always return 0 — even on errors — to avoid permanently blocking ExitPlanMode.

## Design Decisions

| Decision | Rationale |
|---|---|
| Produce-only, no execution | The plan is a composable output. Users incorporate it into their existing workflows rather than being locked into a closed pipeline. |
| Run the planning skill inline (no `context: fork`) | Inline, the skill sees the live plan-mode conversation — the developing task, codebase notes, user back-and-forth — which is the raw material decomposition needs. A forked subagent would start blind with only the skill file as its prompt. |
| Skill + renderer split | LLM handles judgment (decomposition); renderer handles deterministic work (parsing, validation, materialization). Zero tokens spent on rendering. |
| Markdown as contract | Single boundary between skill and renderer. Skill emits `# Title` + `## Unit NN:` + bodies; renderer parses, validates, materializes. Both sides validate independently. The plan-mode plan file + PreToolUse stdin's `tool_input.plan` carry the contract end-to-end with no temp file in between. |
| One-shot skill, agent-driven iteration | One-shot is a design choice, not a platform limit — the skill emits a complete plan in a single pass rather than prompting. The agent gathers feedback in the plan-mode loop and re-invokes; each adjustment is a full regeneration — no state to preserve. |
| Single bundled Node entrypoint | esbuild produces a self-contained `dist/cli.js`; runtime deps (`commander`, `zod`, `eta`) are inlined. End users only need Node ≥ 20. |
| Hook-driven enforcement via deny | Hooks can gate but can't invoke skills or call the LLM. The only way to trigger LLM work from a hook is to deny with an instruction. |
| Regenerate on adjust, don't patch | Full rebuild from scratch is simpler and less error-prone than surgical edits. |

### Post-v1: MCP Server

Deferred per [discussions/cli-over-mcp.md](discussions/cli-over-mcp.md). The CLI binary (`jidoka materialize`) is already the agent-agnostic interface — any agent that can shell out can use it. An MCP server wrapping the same binary is the natural next step for agents that prefer tool-calling over subprocess invocation, but adds no capability that the CLI doesn't already provide.

## Development Setup

### Building

```bash
npm install
npm run build      # bundle ts/cli.ts -> dist/cli.js
npm test           # vitest run
npm run typecheck  # tsc --noEmit
```

The bundled `dist/cli.js` is committed; rebuild after editing anything in `ts/`. Requires Node ≥ 20.

### Making the binary available (optional)

For standalone CLI use outside the plugin, symlink the bundled entrypoint into `~/.local/bin`:

```bash
ln -sf "$(pwd)/dist/cli.js" ~/.local/bin/jidoka
```

`dist/cli.js` carries a `#!/usr/bin/env node` shebang and is chmod 755, so the symlink is executable directly. Subsequent `npm run build` runs overwrite the file in place — the symlink picks up the new version automatically.

> **Prerequisite:** `~/.local/bin` must be on your `$PATH`. Most shells include it by default. If not, add `export PATH="$HOME/.local/bin:$PATH"` to your shell profile.

When the plugin is enabled in Claude Code, the hook calls the bundle directly via `node "$CLAUDE_PLUGIN_ROOT/dist/cli.js" hook`, so no symlink is needed for the plugin path.

## Platform Constraints

- **Pure Node file I/O:** the renderer reads stdin/files and writes the plan dir — that is its only output channel. The date prefix comes from `new Date()` (`todayYymmddLocal()`), not a `date(1)` shell-out. The one subprocess is `git`, used only on the `git_workflow` worktree path (`materialize.ts`).
- **Node ≥ 20 required:** TypeScript source in `ts/`, bundled to `dist/cli.js` via esbuild (`commander`, `zod`, `eta` inlined). `npm run build` rebuilds the bundle, `npm test` runs vitest, `npm run typecheck` runs `tsc --noEmit`.
- **No LLM calls in renderer:** the renderer is deterministic I/O only.
- **Session-scoped staging dir:** the hook stages writes in `<plansRoot>/.jidoka-stage-<sessionId>/` and renames on success. Concurrent hook invocations from different sessions don't collide; identical session_ids would (extremely unlikely under Claude Code).
- **Project-scoped plan dirs:** `<project>/<plan_dir_root>/` (default `docs/exec-plans/active/`). `$CLAUDE_PROJECT_DIR` is the source of truth (PWD fallback with stderr warning when unset).
