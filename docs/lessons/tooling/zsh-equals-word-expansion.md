# In zsh a bare `====` separator is a command lookup, not a string

The Bash tool runs zsh here, and zsh expands any word that begins with `=`
as `=command` (the path of that command). `echo ====` therefore fails with
`==== not found` and, because the `&&` chain stops there, silently drops
every command after it — on 2026-09-26 three batched read commands returned
only their first section for that reason.

Quote separators (`echo '## section'` or `echo '===='`) or use a word that
does not start with `=`; never rely on a bare `=`-prefixed word in a chained
command.
