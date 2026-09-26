# A stacked branch can duplicate its parent's hunks on merge

A branch stacked on another PR carries that PR's original commits. After
the parent is squash-merged and main is merged into the stacked branch,
git sees the same change twice: the squash commit on main and the
original commits on the branch. When the surrounding context moved in
between, git can apply an added block from both sides without a conflict.

On 2026-09-26, merging main into #792 (stacked on #785) auto-merged
`artist-schema.spec.ts` with #785's whole `describe` block twice. There
were no conflict markers. Only the pre-commit ESLint rule
`vitest/no-identical-title` caught it.

After merging main into a stacked branch, list the files the branch
changes that its own commits never touched. Every one of them must be
identical to main:

```bash
own=$(git diff --name-only <parent-tip>..<branch-tip-before-merge>)
git diff --name-only origin/main | grep -vxF "$own"
```

Restore each listed file with `git checkout origin/main -- <file>`,
then commit the merge.
