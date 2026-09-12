# zsh does not word-split unquoted variables

The Bash tool runs zsh, which — unlike bash — does not split an unquoted
`$VAR` on whitespace: `F=$(grep -l …); for f in $F; do …; done` runs ONCE
with every path joined by newlines, so each command reports "No such file"
and the sweep checks nothing. Iterate a glob directly, or split explicitly
with `${(f)F}` (one element per line).
