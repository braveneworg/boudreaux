A simple, visual "software factory": one skill, seven subagents and GitHub
issues. Keep it small: a viewer should understand the whole thing in a few
minutes. The agents carry nothing repo-specific; they read the repo's
`AGENTS.md` (or `CLAUDE.md`) for its language, test command and conventions.

SKILL.md holds the procedure, this file the shape: the loop, the files, the
rules and the commands. Change the shape here first, then make the procedure
in `.claude/skills/factory/SKILL.md` and the agent files match it.

## The orchestrator

The factory is one skill, /factory. Whichever session runs it becomes the
orchestrator: it runs the loop below, spawns every agent, and is the only
writer of the job's stage label and state comment.

## The loop

```
                   ┌──────────────────┐
                   │     feature      │
                   └─────────┬────────┘
                             ▼
                   ┌──────────────────┐
                   │   spec-writer    │
                   │       opus       │
                   └─────────┬────────┘
                             ▼
                   ┌──────────────────┐
                   │     builder      │◄────────────────────┐
                   │       opus       │                     │
                   └─────────┬────────┘                     │
        ┌─────────────┬──────┴──────┬─────────────┐         │
        ▼             ▼             ▼             ▼         │
  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐   │
  │  security │ │    ux*    │ │ ui design*│ │    code   │   │
  │    opus   │ │   sonnet  │ │   sonnet  │ │   sonnet  │   │
  └─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └─────┬─────┘   │
        └─────────────┴──────┬──────┴─────────────┘         │
                             ▼                              │
                   ┌──────────────────┐   any CHANGES:      │
                   │   WAIT FOR ALL   ├─────────────────────┘
                   │ every review not │   resume builder
                   │     skipped      │   (max 2 rounds)
                   └─────────┬────────┘
                             ▼ all PASS
                   ┌──────────────────┐
                   │     approver     │
                   │       opus       │
                   └─┬───────────────┬┘
             APPROVE │               │ ESCALATE
                     ▼               ▼
              ┌─────────────┐ ┌─────────────┐
              │ open PR to  │ │ needs-human │
              │    main     │ │             │
              └──────▲──────┘ └──────┬──────┘
                     └───────────────┘
                      /factory approve

  * skipped when the spec says Surface: none
```

## Target file system

```
.claude/
  skills/factory/SKILL.md          # the orchestrator's procedure
  agents/                          # one file per agent in the loop
  hooks/factory-guard.sh           # the Guard: blocks merges and pushes to main
  settings.json                    # runs the Guard, allows the factory's gh issue comment and gh issue edit
factory/
  dashboard.html                   # visual board of the factory's issues
  serve.py                         # serves the board, reads GitHub through gh
  clean.sh                         # removes the worktree and branch of merged jobs
```

Everything else about a job lives on GitHub and in git: one issue per job, and
one worktree under `.claude/worktrees/` on a `factory/<job-id>` branch.

## Rules

- Every job is one GitHub issue labeled `factory`. Exactly one stage label says
  where it is: `factory:spec`, `factory:build`, `factory:review`,
  `factory:approve`, `factory:pr` or `factory:needs-human`. An open issue with
  no stage label is queued.
- Issue comments are the artifacts. Agents get context from the issue and the
  repo, not the conversation, and each posts only its own comment, headed
  `## spec`, `## build round-<N>`, `## round-<N> review-<kind>` or
  `## decision round-<N>`. The orchestrator keeps one `## state` comment.
- Each review's second line is VERDICT: PASS or CHANGES; the decision's is
  APPROVE or ESCALATE.
- The spec's second line is its Surface: `Surface: page` when the change shows
  on a page, `Surface: none` otherwise. With `none`, the ux and ui reviews are
  skipped reviews: the state comment marks them `skipped` and nobody runs them.
- After a post that succeeded, each agent re-reads the issue's comments and
  confirms its comment landed, with its heading on line 1 and its status line
  on line 2. If it did not, the agent posts it again once, never a third time.
  A post that was denied or failed is never retried and never posted another
  way. The agent's final report gives the URL of the comment it confirmed, or
  the full text of the comment that did not land and the reason.
- The builder works and commits on `factory/<job-id>` in the job's worktree and
  tests against the spec's acceptance criteria.
- WAIT FOR ALL: a review round is done only when every review that is not
  skipped has its comment. Never resume the builder mid-round.
- Spawn the builder with a name (builder-<job-id>) and resume that same builder
  with SendMessage for each new round.
- The factory never merges. APPROVE, or a human's /factory approve, opens a
  pull request whose body says `Closes #<n>`; a human merges it on GitHub.
- An approver that posts no decision sends the job to `factory:needs-human`,
  where a human's /factory approve or /factory rework takes over.
- The Guard enforces that: it blocks `git merge`, `gh pr merge`, pushes to
  main, force pushes, `git branch -D` and commits on main. Branch protection on
  main backs it up on GitHub.

## Commands

```
/factory <feature>               open an issue for the feature and run it through the loop
/factory next                    claim the oldest queued factory issue and run it
/factory approve <job-id>        open a pull request for a needs-human job
/factory rework <job-id> <note>  send a needs-human job back to the builder with feedback
/factory clean                   remove the worktree and branch of every merged job
```
