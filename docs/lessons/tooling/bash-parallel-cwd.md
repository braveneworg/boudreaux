# Parallel Bash tool calls share one persistent shell cwd

Parallel Bash tool calls share ONE persistent shell cwd — a sibling call's `cd`
can land first, silently running a cd-less command in the wrong project (twice
in one session: root typecheck ran in a lambda dir; a bio-generator baseline
ran in stripe-webhook). Start EVERY Bash command with `cd <absolute path> &&`;
never rely on inherited cwd.
