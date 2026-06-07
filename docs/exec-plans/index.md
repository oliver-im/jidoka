# exec-plans/

Scoped, finishable work — a plan decomposed into reviewable units, **frozen as a historical record once completed** (not maintained truth about the code). Lifecycle status is encoded by **location**, never by a file's contents:

- `active/` — in flight. (Under the worktree workflow, an active plan physically lives in `worktrees/<plan-id>/`; see `AGENTS.md`.)
- `completed/` — finished. Frozen, provenance-stamped records.

- **Status: scoped.** A plan describes intended work. Once in `completed/` it is a historical record — *what was intended and done at the time* — **not** current truth about the code.
- **Naming:** `YYMMDD-N-slug/` (one directory per plan), sharing the daily counter `N` with `../ideas/`.
- **Resume protocol & git workflow:** see `AGENTS.md` in this directory.
