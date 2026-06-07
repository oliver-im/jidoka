# exec-plans/active/

In-flight plans — one directory per plan (`YYMMDD-N-slug/`), each holding `overview.md`, `progress.md`, and the per-unit `NN-slug.md` files.

**Intended workflow (pure-worktree).** A plan is worked inside a git worktree — `worktrees/<plan-id>/` on branch `plan/<plan-id>` — so on `main` this directory normally stays **empty** and **`git worktree list` is the live index of in-flight plans**. `main` only ever gains plans under `../completed/` (via `--no-ff` merge). This is the documented convention agents are expected to follow (see `../AGENTS.md`) — not a guarantee hard-enforced by tooling.

- **Status: active / mutable** — the one place plan files are edited as work proceeds (cursor, Done, Blockers in `progress.md`).
- **Naming:** `YYMMDD-N-slug/`, shared daily counter with `../ideas/`.
