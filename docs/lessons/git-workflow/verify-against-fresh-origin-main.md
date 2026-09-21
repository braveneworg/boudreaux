# Verify claims against fresh origin/main

Verify code claims against fresh origin/main (or the worktree), never a local
checkout that may be behind — reading video-metadata.ts from a 6-behind main
checkout produced a confident FALSE "correction" of an accurate design claim
(the 3–10s poster window). Check `git status --branch` / fetch BEFORE grounding
a review, not after.

The rule covers delegated searches too. A subagent sent to inventory the search
comboboxes read the main checkout, which sat on a feature branch behind `main`,
and its report — that the `/artists` trigger had a 1px border and no ink
shadow — was relayed to the user as fact and used to contradict their request.
`origin/main` already carried the 2px border and `shadow-zine-ink` (#755); only
the user's screenshot exposed it.

**How to apply:** before any fact-finding — yours or a subagent's — run
`git fetch origin main` and compare the checkout with `origin/main`. When it is
behind or on another branch, read through the ref
(`git show origin/main:<path>`, `git grep <pattern> origin/main -- <paths>`) and
put that instruction in the subagent's prompt; a subagent reads whatever is on
disk unless told otherwise.
