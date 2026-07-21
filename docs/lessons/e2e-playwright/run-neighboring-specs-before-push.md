# Run the specs that already cover a touched component

When a change touches a component that existing E2E specs already cover, run
those specs locally before pushing — running only the newly added spec misses
regressions (Playwright's string `getByText` is case-insensitive substring and
`toHaveCount` counts hidden elements, so e.g. a hidden Radix select option can
poison a `role=group` text query).
