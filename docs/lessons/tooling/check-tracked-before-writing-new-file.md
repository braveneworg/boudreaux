# Check a "new" file isn't already tracked before writing it

Writing `.claudeignore` at the repo root (2026-09-13) silently replaced a
file the repo already tracked (it dates back to commit `607896f2b`): the file
was assumed not to exist, and the write tool reported "updated" instead of
failing. Before creating a dotfile or config file, run
`git ls-files <path>` (or `ls -a`) first; when it exists, read it and add to
it with an edit rather than writing the whole file.
