# A repo-wide grep reads the env files

Every worktree carries copies of the main checkout's `.env*` files (root
`AGENTS.md`), and they sit at the repository root. `grep -rn NAME .` with no
`--include` reads them, as does `grep -rn NAME . --exclude-dir=node_modules`.
Hard constraint 2 forbids grepping them, because any matching line is
printed with its value.

On 2026-11-08 a sweep for `STRIPE_PRICE` to prove a build arg dead ran
`grep -rn 'STRIPE_PRICE' . --exclude-dir=node_modules …`. It printed one line
from `.env.example` (an empty placeholder) and no secret, but only because
`.env` and `.env.local` happened not to contain the name. The same command
for a name they do contain would have printed a live value into the
transcript.

Rules:

- Search named directories (`src scripts e2e .github stripe-webhook`) or
  restrict by file type with quoted `--include` globs. Never grep `.` bare.
- When the whole tree must be searched, exclude the env files explicitly:
  `--exclude='.env*' --exclude='.envrc'`. `--exclude-dir` does not cover
  them; they are files.
- `git grep` searches tracked files only, so it skips the gitignored `.env`
  and `.env.local`; it still reads the tracked `.env.example`, which the
  deny rules block, so add `-- ':!.env*'`.
- If a value from one of them appears, stop and report it for rotation
  (hard constraint 2), even when it looks like a placeholder.
