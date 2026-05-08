# Unit 07 — Config workflow (claude-hud-style)

**Blocked by:** 05
**Agents involved:** main only
**Topology:** none

## Goal

Add a JSON config file at `~/.claude/plugins/planview/config.json` (claude-hud convention) plus two skills (`planview:setup` and `planview:configure`) that walk the user through options. Per-project override for `planDirRoot` only; everything else is global.

## Tasks

### Config schema

New `src/config.rs`:

- `Config { plan_dir_root: String, auto_open_browser: bool, html_output: bool, hook_behavior: HookBehavior, max_deny_attempts: u32, plan_level_topology: bool }`
- `HookBehavior` enum: `Deny | Warn | Silent`.
- Defaults:
  - `plan_dir_root`: `"notes/plan"` (project-relative)
  - `auto_open_browser`: `true`
  - `html_output`: `true`
  - `hook_behavior`: `Deny`
  - `max_deny_attempts`: `3`
  - `plan_level_topology`: `false` (v1; reserved for v2)
- Loader: layered (built-in defaults < global JSON < project-level `.planview.json` if present).
- Project override applies to `plan_dir_root` only for v1; warn-and-ignore other keys (claude-hud doesn't even have project overrides, but plan_dir_root needs to be per-repo).
- Invalid JSON: warn to stderr, fall back to defaults (claude-hud pattern).

### Runtime integration

- Hook (unit 05) loads config at start of each invocation.
- Materialize (unit 03) uses `config.plan_dir_root` when resolving target dir.
- HTML render (unit 04) gated on `config.html_output`.
- Browser-open gated on `config.auto_open_browser` (in addition to existing `PLANVIEW_NO_OPEN` env var; env var still wins for safety).
- Hook deny-vs-warn-vs-silent gated on `config.hook_behavior`. `Warn` = render anyway, log a stderr warning. `Silent` = behave as if `PLANVIEW_NO_AUTO` were set.
- `config.max_deny_attempts` replaces the hardcoded 3 in `hook.rs`.

### `planview:setup` skill

New skill, `skills/setup/SKILL.md` (or wherever skills live in this repo's plugin structure):

- Interactive walkthrough: ask each setting in order, show the default, accept user input or Enter-for-default.
- After all answers, show a preview (the resulting JSON, formatted) and ask confirm/edit/abort.
- On confirm, write `~/.claude/plugins/planview/config.json` (mkdir -p the parent).
- AskUserQuestion is OK here: this skill is not in fork context; it's user-facing.

### `planview:configure` skill

New skill, `skills/configure/SKILL.md`:

- Read existing config, present diff-style "current = X, change to?" for each setting.
- Preserve any keys not in the questionnaire (manual edits stay; claude-hud invariant).
- Same preview-then-confirm flow as setup.
- If config doesn't exist, redirect to `planview:setup`.

### Tests

New `tests/config_test.rs`:

- Layered loading: defaults only / global only / global + project / invalid global / invalid project.
- Round-trip: defaults → JSON → parse → identical struct.
- Project override: only `plan_dir_root` applied, others warned-and-ignored.
- Manual edits preservation: write a config with extra keys, run loader, confirm extra keys present in serialized output (or at least retained on `configure` re-write).

## Acceptance

- `planview:setup` writes a valid config; `planview:configure` re-runs and edits it without losing manually added keys.
- Hook respects all config knobs (manual smoke: flip `auto_open_browser` to false, verify browser does not open).
- Project override at `<project>/.planview.json` overrides `plan_dir_root` for that project only.

## Review

- [ ] Local: `/code-review:code-review`
- [ ] Agent CLI: config layering is the kind of thing that breaks subtly — focus on precedence ordering and key preservation
- [ ] Manual smoke per acceptance
- [ ] Commit
- [ ] Update progress.md → all units done; archive plan dir to `notes/done/plan/260505-0-plan-units/` per repo convention
