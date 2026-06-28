# exec-plans/

Scoped, finishable work across its lifecycle — from candidate item, to plan in flight, to **frozen historical record once completed** (not maintained truth about the code). Lifecycle status is encoded by **location**, never by a file's contents:

- `backlog/` — candidate work, not yet started (may drift; the directory is the disclaimer).
- `active/` — in flight. (Under the worktree workflow, an active plan physically lives in `worktrees/<plan-id>/`; see `AGENTS.md`.)
- `completed/` — finished. Frozen, provenance-stamped records.

- **Status: scoped.** A plan describes intended work. Once in `completed/` it is a historical record — *what was intended and done at the time* — **not** current truth about the code.
- **Naming:** `YYMMDD-N-slug` (a `backlog/` file, or one directory per `active/`/`completed/` plan), with the daily counter `N` shared across `backlog/` and `active/`.
- **Resume protocol & git workflow:** see `AGENTS.md` in this directory.
