# planview/notes/ — Planning, Research, and Review Documents

Plans, research, and backlog items for the planview project. Tracked in git so diffs are reviewable.

## Layout

```
notes/
  plan/                         # active plans (one dir per plan)
    <YYMMDD-N-slug>/
      overview.md
      progress.md
      0N-<unit-slug>.md ...
  research/                     # research notes (one file or dir per topic)
    <YYMMDD-N-slug>.md
    <YYMMDD-N-slug>/...
  backlog/                      # ideas not yet started
    <YYMMDD-N-slug>.md
  done/                         # archive (symlink to ~/hhe/notes/planview)
    plan/<YYMMDD-N-slug>/
    research/<YYMMDD-N-slug>.md
```

Subdirs are created lazily — only `plan/` and the `done/` symlink exist by default.

## Naming

- Format: `<YYMMDD>-<N>-<slug>` (directories or `.md` files; same shape either way).
- `YYMMDD` — date the entry was bootstrapped (local time, two-digit year).
- `N` — counter that resets each day, **shared** across `notes/plan/`, `notes/research/`, `notes/backlog/`, and `notes/done/plan/`. To pick the next N, scan all four dirs for entries matching `^<today>-(\d+)-` and take max + 1, or 0 if none.
- `slug` — kebab-case, ≤ 60 chars, no leading/trailing hyphen, `^[a-z0-9-]+$`.

For plans, units inside the plan dir are named `<NN>-<unit-slug>.md` where NN is a two-digit, plan-local counter starting at 01 (e.g. `01-housekeeping.md`).

## Archiving

When a plan or research note is complete or no longer active:

1. Move it under `done/`, preserving the original `<YYMMDD-N-slug>` name. Plans go to `done/plan/<YYMMDD-N-slug>/`; research notes go to `done/research/<YYMMDD-N-slug>.md`.
2. The original date prefix stays — do **not** rename to the completion date.

`done/` is a symlink to `~/hhe/notes/planview` — archived items leave the git-tracked repo.

## Resume protocol

For active plans, see `notes/plan/AGENTS.md` — when resuming, read `progress.md` first, then the cursor unit's md.
