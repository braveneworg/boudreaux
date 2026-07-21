# commitlint's 50-char cap covers the full header

commitlint's 50-char cap applies to the FULL header — `type(scope): ` prefix,
gitmoji (counts as 2 chars), and subject all included, so `refactor(hooks): ♻️ `
alone eats 20 — count the whole header line, and drop the scope when the
subject won't fit.
