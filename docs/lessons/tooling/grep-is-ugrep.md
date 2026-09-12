# `grep` in this shell is ugrep, with regex complexity limits

`grep` here is ugrep: a bounded wildcard such as `.{0,200}` around a match
fails with "exceeds complexity limits" instead of matching — and behind
`2>/dev/null` the search silently reports nothing, which reads like "not
found". To print context inside minified bundles, search a plain fixed
string, or slice the file around `indexOf()` with a short `node -e` script.
