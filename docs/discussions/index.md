# discussions/

High-level design discussions — the **"what should we build, and why"** reasoning behind the system. **Living current-best thinking**, edited in place as it matures (not a frozen archive, not a neutral wiki). **Not** governed by the plan-lifecycle convention — `../CONVENTION.md` covers only `exec-plans/`. See `AGENTS.md` for the doc shape, lifecycle, and when to write here.

- **Status: current.** Everything here is true *right now* — grep it freely. When a decision is reversed it is **not** kept here: it `git mv`s to `../exec-plans/completed/` with a `STATUS: superseded · …` stamp (the single home for frozen history), so `discussions/` never accumulates a graveyard.
- **Naming: topic-named** (`cli-over-mcp.md`, `review-pipeline.md`) — referenced by subject, not date.
- Each doc's **H1 carries its one-line stance** (`# <Topic> — <stance>`), so the catalog below re-derives for free.

## Catalog

A **re-derivable catalog** (one line per doc, its H1 stance), not hand-maintained meta.

_Re-derive: `find docs/discussions -name '*.md' ! -name 'index.md' ! -name 'AGENTS.md' -exec grep -hm1 '^# ' {} + | sed 's/^# /- /' | sort`_

- CLI over MCP — the CLI binary is already the agent-agnostic interface; defer MCP to post-v1
- Codex adversarial review on large diffs — always trigger self-collect; never rely on the inline-diff path
- Convention carrier — CONVENTION.md lives in jidoka and travels by copy; no separate repo yet
- Default plan_dir_root = docs/exec-plans/active — ship the convention batteries-included, not a neutral plan/
- googleworkspace/cli as a productization reference — copy the discipline (CLI-first, self-describing, distribution), not the surface area
- Review-pipeline direction — unit_review on the built-in /code-review (local diff, no --fix); plan_review opt-in via tool-agnostic templates
- Skill distribution — one canonical source copied into per-agent dirs (not symlinks); three-layer local testing
- Strategic review — proceed: no strategic blocker; defer MCP, keep the skill Claude-specific, don't over-invest in polish

> **Reversed decisions** aren't listed here — they live as frozen records in [`../exec-plans/completed/`](../exec-plans/completed/), stamped `superseded` (the diagram-backend, browser-debugging, and Rust-runtime choices, overturned when the topology/HTML subsystem was excised and the renderer moved to TypeScript).
