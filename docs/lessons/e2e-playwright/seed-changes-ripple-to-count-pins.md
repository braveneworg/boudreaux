# Seed changes ripple to count-pinning specs

Changing the E2E seed ripples beyond "neighboring" specs: any spec pinning
seed-derived counts (e.g. the admin-dashboard tile totals) breaks in CI —
before pushing a seed change, grep e2e/tests for count-pinning assertions
(`getByText('1[0-9]'`, `published · `) and run those specs locally too.
