# Unit 05 — Generalize review-step invocation (composer + pre-review flag)
**Blocked by:** 04-author-planview-s-own-plan-level-review-prompt**Agents involved:** main only**Topology:** none
## Summary

Generalize how review steps are *invoked*. (a) Make `skills/plan-review-prompt/SKILL.md` honor the configured `plan_review` step shape — fill placeholders, inject planview's own prompt for generic tools, and either print (default) or run via Bash (exec) — dropping the hardcoded `/codex:adversarial-review`. (b) Flip `pre-plan-review` to agent-invocable so `pre_review` can auto-run (the auto-run-then-stop *behavior* is specified in Unit 07).

Tasks:
- Read the configured `plan_review` `ReviewStep` (slash command vs `{ run, mode }`).
- Resolve `{base}`, `{diff_range}` (= `merge-base(<base>,HEAD)..HEAD`), `{plan_dir}`; compose `{focus}` (keep the existing high-value aiming — cross-unit seams, deferred forward-references). Substitute into the template.
- For a generic tool (e.g. `codex exec`), inject the Unit 04 plan-review prompt + focus + diff into the command. For the legacy `/codex:adversarial-review` slash form, behave as today.
- If `mode: "print"` (default): emit the ready-to-run command and **stop** for the operator (preserves the checkpoint). If `mode: "exec"`: run the substituted command via the Bash tool and surface findings — document in the skill why Bash-run is legitimate (only the SlashCommand route is blocked, not Bash).
- Update the skill frontmatter/description to match the new behavior.
- **Pre-review invocation:** remove `disable-model-invocation: true` from `skills/pre-plan-review/SKILL.md` so the resume agent can invoke it. (Today the flag hides it from the model entirely — it doesn't even appear in the agent's available-skills list, which is why pre-plan-review can't auto-run while the composer and `planview` skills can.) This only *enables* auto-run; the first-session auto-run-then-stop instruction lands in Unit 07's resume-protocol changes — a "nothing references the now-invocable skill yet" flag here is an expected forward-reference.

Acceptance: composer no longer hardcodes `/codex:adversarial-review`; honors both step forms; `print` stops for the operator, `exec` runs via Bash; planview's own prompt is injected for generic tools; the focus/aiming behavior is preserved; `pre-plan-review` no longer sets `disable-model-invocation` and is now agent-invocable (appears in the available-skills list).
Depends on Unit 02 (representation) + Unit 04 (the prompt). Wires up the Unit 04 forward-reference.

## Review pipeline

- [ ] `/code-review`
---
See `progress.md` for the cursor and overall plan state.
