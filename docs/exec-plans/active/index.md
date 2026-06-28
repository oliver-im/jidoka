# active/

In-flight plans live in **git worktrees**, not on `main` — so there is no static catalog here. The live index is:

```sh
git worktree list
```

For the one-line summary of what each in-flight plan is about, grep the worktrees:

```sh
find worktrees -path '*/active/*/overview.md' -exec grep -hm1 '^# ' {} + | sed 's/^# /- /' | sort
```

(This file is just a pointer; it keeps the otherwise-empty `active/` directory tracked on `main`.)
