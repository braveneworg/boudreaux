# boudreaux — Agent & Contributor Guidelines

Last updated: 2026-07-21

Single source of truth for how to work in this repository — for humans and for
every AI coding agent. Tool-specific files (e.g. `CLAUDE.md`) defer to this
document. Directory-specific rules live in nested `AGENTS.md` files and
hard-won lessons in `docs/lessons/` — load both on demand as described below;
never preload everything.

## How to work

- Every edit happens in a worktree branched off freshly-fetched `origin/main`
  (`.claude/worktrees/<type>-<name>`, branch renamed to `<type>/<name>`) —
  never in the main checkout.
- TDD is non-negotiable: write the test first, watch it fail, then implement.
  Every feature and bug fix ships with tests.
- Quality over speed. These guidelines are binding — when code can't comply,
  say so rather than silently working around them.
- Reuse before you create — search for an existing component, type, field, or
  util before adding one. Server Components, Server Actions for mutations, and
  named exports are the default posture.
- Gate before committing — all four must pass:
  `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format`.

## Hard constraints

1. **E2E / database isolation** — before touching E2E, the DB, builds, dev
   servers, seed scripts, or anything that reads the environment, read
   [`e2e/AGENTS.md`](e2e/AGENTS.md) in full. When in doubt there, stop and ask.
2. **Secrets and `.env*`** — never read, print, copy, decrypt, or pipe the
   contents of `.env*`, `.envrc`, `*.pem`, `*.key`, `id_*`, `.aws/credentials`,
   `.npmrc`, `~/.config/gh/hosts.yml`, or any secret-bearing file — with any
   tool, even piped through `head`/`wc` or redirected; running the command
   captures the value regardless. Never quote or log any value from them, even
   partially; never run `git diff`/`show`/`log -p`/`grep` on paths that may
   contain secrets without confirming the path is safe. Treat all `.env*` as
   production secrets (gitignored / "dev only" does not make them safe);
   refuse pasted `.env` content. Redact to `***` any env var matching
   `*_URL`, `*SECRET*`, `*TOKEN*`, `*KEY*`, `*PASSWORD*`, `*PASSWD*`,
   `*CREDENTIAL*`, `*DSN*`, `*CONNECTION*` before it could appear in output.
   If a task "needs" a secret value, ask for a placeholder. If a secret (even
   partial) appears in any output or input: stop, tell the user it must be
   rotated, do not repeat it, and wait.

## Directory guides (load on demand)

Before working under a directory, read its `AGENTS.md`:

| File                                     | Covers                                                              |
| ---------------------------------------- | ------------------------------------------------------------------- |
| [`src/AGENTS.md`](src/AGENTS.md)         | Architecture, TypeScript rules, data fetching, unit testing, naming |
| [`src/app/AGENTS.md`](src/app/AGENTS.md) | Components, forms, styling, accessibility, performance              |
| [`src/lib/AGENTS.md`](src/lib/AGENTS.md) | Server Actions, repositories, services, validation, decorators      |
| [`e2e/AGENTS.md`](e2e/AGENTS.md)         | E2E DB isolation (mandatory), Playwright practices                  |
| [`prisma/AGENTS.md`](prisma/AGENTS.md)   | Schema, seed, MongoDB safety                                        |

## Lessons (load on demand)

Hard-won, repo-specific lessons live in `docs/lessons/<category>/` — one file
per lesson. Never preload them all. Before starting work that matches a
category, read every file in that category's directory, recursing into any
subdirectories:

| Category          | Load before                                                 |
| ----------------- | ----------------------------------------------------------- |
| `git-workflow/`   | branching, committing, pushing, PRs, code review            |
| `e2e-playwright/` | writing, running, or debugging E2E specs; changing the seed |
| `react-nextjs/`   | UI components, dynamic imports, Radix, bundling             |
| `prisma-mongo/`   | schema, seed, or query changes                              |
| `tooling/`        | shell-heavy work, lint config, stress-repro runs            |

When corrected — or when you catch your own mistake — add the lesson as a new
file in the matching category (create a new category directory if none fits)
before continuing, so it never happens again.

## Stack

Versions track `package.json` — update this block when they change.

- TypeScript 6 (strict), Node 24 (from `.nvmrc`, never global), pnpm 11 —
  `pnpm exec` for CLI tools (`prisma`, `tsx`, …).
- Next.js 16 (App Router, Turbopack dev, webpack build), React 19.
- Prisma 6 + MongoDB; AWS SDK S3 v3 (presigned URLs — 24h download, 15min
  upload); better-auth (magic-link + social OAuth, admin plugin); Stripe 21
  (payment-mode checkout, PWYW); AWS SES.
- shadcn/ui (Radix), Tailwind v4, lucide-react, Jost font; RHF 7 + Zod 4;
  TanStack Query 5; Vitest 4 + Playwright.

Shipped: digital formats + S3 presigned up/download + freemium quota; Stripe
PWYW checkout + download gate; tour management + admin CRUD; release search +
media player; playlists; videos.

## Project structure

```text
src/
├── app/                # App Router pages, layouts, API routes (api/ = GET + Stripe webhook)
│   ├── components/     # Shared feature components; ui/ = shadcn primitives; forms/fields/
│   └── */_hooks/       # Feature/route-scoped hooks
├── hooks/              # Global client hooks, mutations/ subfolder
├── lib/                # actions/, decorators/, repositories/, services/, validation/, email/, utils/
prisma/schema.prisma    # MongoDB schema
e2e/                    # Playwright (fixtures, helpers, tests)
scripts/                # tsx scripts (mongo backup, S3 ops, image variants)
docs/lessons/           # Categorized lessons (see above)
docs/auto-generated/    # AI-generated markdown goes here
docs/agents/            # Engineering-skills config (see Agent skills below)
```

## Commands

```bash
pnpm run dev                  # Dev server (Turbopack)
pnpm run build                # Production build (webpack)
pnpm run test:run             # Unit tests once (test = watch mode)
pnpm run test:coverage:check  # Coverage + regression check vs COVERAGE_METRICS.md
pnpm run test:e2e             # Playwright E2E
pnpm run e2e:docker:up        # Start isolated E2E Mongo (localhost:27018)
pnpm run e2e:docker:down      # Tear down E2E Mongo + volumes
pnpm run typecheck            # tsc on tracked types
pnpm run lint                 # ESLint check + auto-fix (--max-warnings 0)
pnpm run format               # Prettier write (format:check = no write)
pnpm exec prisma db push      # Push schema to MongoDB
pnpm run seed                 # Seed dev DB (tsx prisma/seed.ts)
pnpm run stripe               # Forward Stripe webhooks to localhost:3000
```

## Commits & git hooks

- Conventional Commits, enforced by commitlint: header ≤50 chars INCLUDING the
  `type(scope): ` prefix and gitmoji (counts as 2); body/footer lines ≤72.
  Format `type(scope): <gitmoji> subject` — `feat: ✨`, `fix: 🐛`,
  `refactor: ♻️`, `perf: ⚡`, `docs: 📝`, `test: ✅`, `chore: 🔧`, `style: 🎨`.
  The type drives the automated version bump + `CHANGELOG.md` — pick it
  accurately.
- Never commit or push to `main`; never bypass hooks with `--no-verify`; never
  add AI attribution / `Co-authored-by` lines. Atomic commits when working
  autonomously.
- Husky: **pre-commit** blocks `main`, runs gitleaks, lint-staged, and
  `vitest --changed`; **pre-push** requires up-to-date with `origin/main`,
  rejects WIP/`fixup!` commits, runs `tsc --noEmit`, lint, and
  `test:coverage:check`; **post-merge** reinstalls deps / regenerates Prisma
  when the lockfile or schema changed.

## Conventions

- Secure defaults always (CORS, cookie flags, rate limits); least privilege;
  validate and sanitize all external input. Config and secrets in env vars —
  never hardcoded. Auth cookies are `httpOnly`/`secure`/`sameSite`; web
  storage only for non-sensitive client state.
- Dependencies: reuse an existing one before adding (check `package.json`);
  weigh bundle size, maintenance, security, and MPL-2.0 compatibility.
- Add the MPL header from `HEADER.txt` to every new source file. AI-generated
  markdown goes in `docs/auto-generated/`; never author docs from files
  outside this repo. Never commit generated files or build artifacts.
- When editing a line, confirm nearby comments are still accurate.
- Refactor with confidence — tests, types, and review catch mistakes. Update
  or remove tests to match the new structure; no orphaned tests or code.

## Agent skills

Per-repo config for the engineering skills (`to-tickets`, `triage`, `to-spec`,
`wayfinder`, …). Skills resolve these pointers at runtime.

### Issue tracker

GitHub Issues on `braveneworg/boudreaux`, driven via the `gh` CLI.
See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`,
`ready-for-human`, `wontfix`), applied as GitHub issue labels.
See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at the root is the glossary; decisions live in
`docs/adr/`. See `docs/agents/domain.md`.
