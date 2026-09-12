# Quote grep's `--include` globs in zsh

zsh expands an unquoted `--include=*.ts` itself and, finding no matching file
in the cwd, aborts the whole command with `no matches found: --include=*.ts`
— grep never runs, so a codebase sweep silently reports nothing. Always quote
the pattern: `grep -rn PATTERN src --include='*.ts' --include='*.tsx'`.
