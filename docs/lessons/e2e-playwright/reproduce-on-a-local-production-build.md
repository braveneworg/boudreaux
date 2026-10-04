# Reproduce a CI-only failure on a local production build

CI runs the E2E suite against the production build (`CI=true`,
`node .next/standalone/server.js`); a local run uses `next dev`. A failure
seen only in CI needs the production build before it is called a flake.

The `nextjs-build-e2e` artifact of a CI run cannot be reused on macOS: its
standalone `node_modules` carries Linux binaries (the Prisma query engine,
`sharp`). Build locally the way the `build-e2e` job does:

```bash
env -i PATH="<mise node bin>:<mise pnpm dir>:/usr/bin:/bin:/usr/sbin:/sbin" HOME="$HOME" \
  DATABASE_URL='mongodb://localhost:27018/build-placeholder?replicaSet=rs0' \
  SKIP_ENV_VALIDATION=true SKIP_CDN_ASSET_PREFIX=true NODE_ENV=production \
  NEXT_PUBLIC_E2E_MODE=true <the job's other NEXT_PUBLIC_* placeholders> \
  AUTH_SECRET=<test-only placeholder> AUTH_URL=http://localhost:3000 \
  pnpm exec next build --webpack
mkdir -p .next/standalone/.next/static .next/standalone/public
cp -R .next/static/. .next/standalone/.next/static/
cp -R public/. .next/standalone/public/
CI=true E2E_DATABASE_URL='mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0' \
  pnpm exec playwright test <specs> --workers=2 --retries=0
```

- The build's placeholder `DATABASE_URL` must point at `localhost:27018`,
  even though the build never connects. The CI job uses `localhost:27017`;
  copying it on 2026-10-04 got the command denied by the database ask rules
  (root `AGENTS.md`, hard constraint 1), which is the rule working.
- `env -i` drops the shell's PATH, so `pnpm` and `node` must be named by
  their mise install directories (`which pnpm node` beforehand).
- macOS `cp` has no `-T`; `cp -R src/. dest/` merges the same way.
- Build in a worktree without `.env*` files, or the build reads them.
- `--repeat-each` with several workers runs copies of one test at once.
  A spec that edits one seeded row (`admin-video-artist-review.spec.ts`)
  then collides with itself; that failure is the stress, not the bug (see
  `stress-repro-limits.md`). Confirm with a CI-shaped run of the different
  neighbouring specs.

When the failure still does not reproduce, read the CI trace's timeline
(`*.trace` action logs, `*.network` request times, screencast frames) for
the event that lands just before it, and make the spec wait for that
event's visible result. On 2026-10-04 the featured-artists popover of the
video form closed in CI as the review section's debounced name lookup
landed; 120 local runs on both servers passed. The specs now wait for the
lookup's "Links to existing artist" chip before they open the popover.
