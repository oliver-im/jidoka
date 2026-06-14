# Strategic Review (March 2026)

Pre-implementation review of four strategic risks before investing in building jidoka.

## 1. Differentiation from visual-explainer

**Verdict: Not a competitor. Different domain.**

[visual-explainer](https://github.com/nicobailon/visual-explainer) (6.8k stars, MIT, v0.6.3) is a general-purpose "make terminal output beautiful" tool. It provides 8 slash commands (`/generate-web-diagram`, `/generate-visual-plan`, `/generate-slides`, `/diff-review`, `/plan-review`, `/project-recap`, `/fact-check`, `/share`) that have the LLM produce complete styled HTML directly.

| | visual-explainer | jidoka |
|---|---|---|
| Domain | Any visualization | Agent task decomposition |
| Renderer | LLM generates HTML | Deterministic binary |
| Data contract | None | JSON schema + validation rules |
| Reproducibility | Varies per run | Same JSON = same output |
| Hook integration | None | ExitPlanMode pre-approval |
| Agent semantics | None | execution modes, blocked_by, phased dispatch |
| Token cost | High (full HTML generation) | Low (JSON only) |

The two tools could coexist — visual-explainer for general visualization, jidoka for multi-agent planning. No overlap in purpose.

Worth noting from visual-explainer: sharing/deployment (Vercel via `/share`), multi-platform support (also works with Pi and OpenAI Codex).

## 2. Native Claude Visualization Risk

**Verdict: Low risk. Anthropic is not building this for Claude Code.**

[Claude Builds Visuals](https://claude.com/blog/claude-builds-visuals) (March 12, 2026) announces interactive charts and diagrams in the **chat web UI** (claude.com). No mention of Claude Code, developer workflows, or plan visualization.

Evidence that Claude Code won't get native visualization:
- **GitHub issue [#20529](https://github.com/anthropics/claude-code/issues/20529)** requesting Mermaid rendering in the VS Code extension was closed as **NOT_PLANNED** (Feb 27, 2026), locked Mar 7. No Anthropic response.
- Community MCP servers exist (claude-mermaid, draw.io, Mermaid Chart connector), suggesting Anthropic prefers the ecosystem to handle this.
- Claude Code's terminal-first architecture makes rich visualization harder than in a web UI.

Plan visualization specifically is not on any public roadmap. The chat UI improvements target general data visualization, not agent topology.

## 3. Plan Mode Longevity

**Verdict: Plan mode is deepening, not disappearing.**

Evidence from Jan–Mar 2026:
- 8+ plan-related changes: optional `/plan` description argument, VS Code markdown plan view with commenting, session auto-naming from plan content, multiple bug fixes
- **Dedicated Plan subagent type** added alongside Explore and General-purpose — significant architectural investment
- Zero deprecation signals (only `/output-style` was deprecated recently, replaced by `/config`)

Industry convergence makes removal even less likely:
- **Cursor** — Plan Mode + subagents (v2.4), up to 8 parallel cloud agents
- **Cline** — Explicit Plan & Act dual modes, different models per mode
- **GitHub Copilot** — Plan mode in Agent Mode + Fleet mode (parallel subagents)
- **Kiro (AWS)** — Spec-driven development generating requirements.md, design.md, tasks.md
- **OpenHands** — Event stream architecture with agent delegation

Plan mode is being treated as core infrastructure across the industry, not an experiment.

## 4. Agent-Agnostic Design

**Verdict: The renderer is already agent-agnostic. Only the skill and hook are Claude-coupled.**

### Current coupling points

1. **Skill** — Claude Code skill config (`context: fork`, `allowed-tools`), `CLAUDE_SESSION_ID`
2. **Hook** — PreToolUse on ExitPlanMode (Claude Code hook system)
3. **Terminology** — "agents" aligns with Claude Code's Agent tool (though this is industry-standard)

The renderer binary (`echo JSON | jidoka` → HTML) has zero Claude dependency.

### Integration paths per agent

| Agent | Plan mechanism | Integration path |
|---|---|---|
| Cursor | Plan Mode + subagents | Custom Rule + MCP server |
| Cline | Plan & Act modes | Custom Instruction + MCP |
| GitHub Copilot | Agent Mode plans | Custom Instruction + Action |
| Kiro | requirements.md → tasks.md | tasks.md parser → JSON adapter |
| OpenHands | Event stream + delegation | Event hook → JSON adapter |

### Emerging standards

- **A2A (Agent-to-Agent Protocol)** — Google Cloud, horizontal agent communication
- **MCP** — Already the de facto agent-to-tool standard, supported by most agents
- **TDF (Task Decomposition Format)** — Declarative task encoding with goals and dependencies

### Practical approach to portability

The renderer is the portable asset. Steps toward agent-agnosticism:
1. Publish the JSON schema as a standalone spec — any agent can target it
2. Offer an MCP server mode for the renderer (most agents support MCP)
3. Keep skill prompts per-platform in separate directories
4. Use platform-neutral temp file naming instead of `CLAUDE_SESSION_ID`

---

## Risk Summary

| Risk | Level | Rationale |
|------|-------|-----------|
| Obsoleted by visual-explainer | **None** | Different domain entirely |
| Anthropic adds native plan visualization | **Low** | Feature request closed, ecosystem-first approach |
| Plan mode deprecated | **Very Low** | Active development, industry convergence |
| Claude lock-in limits adoption | **Medium** | Renderer is portable; skill+hook need per-platform adapters |
| Spec-only project loses momentum | **High** | No code exists yet; implementation is overdue |

## Recommendations

1. **Proceed with implementation** — no strategic blocker found. Clear differentiation, real gap in the ecosystem.
2. **~~Design the renderer as an MCP server from day one~~** — *Revised: defer MCP to post-v1 per [cli-over-mcp.md](cli-over-mcp.md). The CLI binary is already agent-agnostic.*
3. **Keep the skill Claude Code-specific for now** — it's the primary platform. Add Cursor/Cline adapters after the core works.
4. **Don't over-invest in aesthetic polish** — jidoka's value is structural correctness, not cosmetic beauty.
