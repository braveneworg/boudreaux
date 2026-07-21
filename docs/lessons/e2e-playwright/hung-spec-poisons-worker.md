# A hung spec poisons its worker and cascades collateral failures

A hung Playwright test (45s timeout → "Target page, context or browser has
been closed") poisons its worker and cascades COLLATERAL failures onto
unrelated specs sharing it (e.g. a `getByRole('combobox')` "element(s) not
found" in a different feature) — diagnose the true root cause in the hanging
spec, not the collateral one; the collateral clears once the hang is fixed.
