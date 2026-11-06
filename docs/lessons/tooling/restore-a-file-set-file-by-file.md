# Restore a backed-up file set file by file, not with `cp -R dir/`

The shell's `cp` here is GNU coreutils, not BSD. GNU `cp -R src/ dest/`
copies the directory `src` itself into `dest`, trailing slash or not. BSD
`cp` copies the contents. So the BSD idiom nests the tree one level down.

On 2026-11-05 (card 3, playlist add codes) the new sources were backed up
to the scratchpad so the changed specs could be run against the baseline
sources, to show them red. The restore was `cp -R "$S/src/" src/`. It
created `src/src/app/...` and `src/src/lib/...` and left the baseline
sources in place. `git status` caught it: only the spec files showed as
modified, and `src/src/` was untracked. Nothing was committed from that
state.

Rules:

- To set sources aside, prefer a `wip:` commit on the branch (see
  `docs/lessons/git-workflow/commit-wip-instead-of-stash.md`). Swap in the
  baseline with `git checkout <base> -- <files>`, and bring the work back
  with `git checkout HEAD -- <files>`. A file the branch deleted comes back
  from the baseline staged as added, and `checkout HEAD` leaves it there:
  `git rm -f` it, then check `git diff HEAD --stat` is empty.
- If you must copy, copy each file to its own path, or copy named
  subdirectories into the parent (`cp -R backup/app backup/lib src/`).
- After any restore, run `git status --short` and compare it with the list
  before the swap. An untracked directory nested inside its own name is
  this mistake.
