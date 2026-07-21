# Avoid unescaped `!` in zsh command strings

In zsh command strings, avoid unescaped `!` because history expansion can
prevent validation commands from running; express boolean checks without it or
single-quote the script safely.
