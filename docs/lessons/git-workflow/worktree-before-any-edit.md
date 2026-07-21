# Worktree before any edit

Before ANY edit — even a "small config fix" — create a worktree off
freshly-fetched origin/main (EnterWorktree → `.claude/worktrees/<type>-<name>` —
the tool rejects `+` in names — then rename the branch to `<type>/<name>`);
never branch or edit in the main checkout (~/.config/agents/AGENTS.md line 1).
