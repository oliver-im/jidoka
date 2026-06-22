# Codex plan-mode automation gap

Codex can run jidoka's portable renderer today, but it does not yet expose the plan-mode lifecycle control that makes jidoka feel automatic in Claude Code.

## Learning

The portable part is fine: Codex can produce the same plan markdown shape that `jidoka materialize` already accepts, and Codex skills can be invoked explicitly or implicitly from a task description.

The missing part is the lifecycle adapter. Claude Code gives jidoka an `ExitPlanMode` hook payload containing the plan markdown, so jidoka can materialize the plan directory before the user approves execution. Current Codex documentation describes plan mode as user-entered with `/plan` or `Shift+Tab`; it does not document an agent-callable `EnterPlanMode` / `ExitPlanMode` tool, a "start in plan mode" config, or a plan-exit hook payload containing the final plan.

## Upstream signals

The missing primitives already have public feature requests in `openai/codex`:

- [openai/codex#11180](https://github.com/openai/codex/issues/11180) asks for `EnterPlanMode` and `ExitPlanMode` tools so a skill can move the agent into plan mode.
- [openai/codex#12738](https://github.com/openai/codex/issues/12738) asks for the agent to enter plan mode automatically; it was closed as a duplicate of #11180.
- [openai/codex#13942](https://github.com/openai/codex/issues/13942) asks for a config option to start Codex in plan mode by default.
- [openai/codex#9795](https://github.com/openai/codex/discussions/9795) asks for stronger skill auto-apply configuration.
- [openai/codex#21753](https://github.com/openai/codex/issues/21753) tracks broader Claude Code hook parity, including plan prompts, approval prompts, skills, and lifecycle transitions.

## Practical direction for jidoka

Do not block Codex support on hook parity. Add Codex as a manual or semi-automatic adapter first:

1. Package a Codex skill that emits jidoka-compatible plan markdown.
2. Document the flow: enter `/plan`, invoke the skill, save/copy the markdown, then run `jidoka materialize`.
3. Keep the renderer and plan data model tool-agnostic.
4. Revisit full automation only when Codex exposes an agent-callable plan-mode transition or a hookable final-plan event.

The good product boundary is: Codex can be a jidoka plan producer now; Codex cannot yet be a Claude-style automatic plan-mode harness for jidoka.
