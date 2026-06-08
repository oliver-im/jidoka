# Unit 07 — Docs — data-model, agent-guide, resume protocol, README
**Blocked by:** 06-config-ux-setup-questionnaire-annotated-comments**Agents involved:** main only**Topology:** none
## Summary

Bring the prose docs in line with the new behavior so the lifecycle docs stop claiming review steps are slash-command-only.

Tasks:
- `docs/data-model.md`: extend "Command semantics & invocation" with the `ReviewStep` shape (slash vs template), placeholders, and `print`/`exec`.
- `docs/agent-guide.md`: note in `review_steps` that steps may be templates; per-unit focus still lives in unit-body prose.
- `docs/exec-plans/AGENTS.md`: resume protocol — (i) **first session**: the agent **auto-runs** the `pre_review` step against the freshly materialized plan dir, surfaces findings, and **stops before Unit 01** (surface, do *not* auto-revise); (ii) at unit and plan level, explain `print` (surface command, stop) vs `exec` (run via Bash, legitimate because only SlashCommand is blocked); update the plan-level paragraph that currently names `/codex:adversarial-review`; (iii) specify placeholder substitution for `unit_review`/`pre_review` templates — the resuming agent substitutes `{plan_dir}` etc. before running (only the `plan_review` composer substitutes automatically), and this prose must agree with the rendered `## Pre-execution review` framing from Unit 03. Frame the operator-vs-agent axis as spanning all three stages.
- `README.md`: config table + three-stages prose + a worked example showing a `codex exec` template and an `exec`-mode `plan_review`.
- Sweep for stale "slash-command-only" / hardcoded-codex claims.

Acceptance: all four docs describe the template form + `print`/`exec` + the Bash-run rationale; the resume protocol documents the first-session `pre_review` auto-run-then-stop; README has the worked example; no stale "slash-command-only" claims remain; plan-level review docs no longer hardcode codex.
Depends on the behavior from Units 02–05.

## Review pipeline

- [ ] `/code-review`
---
See `progress.md` for the cursor and overall plan state.
