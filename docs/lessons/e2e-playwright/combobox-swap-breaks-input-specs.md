# Swapping a text field for a combobox breaks every input-driving spec

Replacing a form text field with a combobox breaks EVERY existing E2E that
drove it as an input: `getByLabel(label).fill()` / `.toHaveValue()` throw
"Element is not an `<input>`" / "Not an input element" against a
`role=combobox` button. Before pushing such a swap, grep `e2e/` for the field's
label and rewrite each spec to drive the combobox (open trigger → type in the
`CommandInput` → click the `role=option`), and prefer
`getByRole('combobox', { name })` (stable via the `<label htmlFor>`→trigger-`id`
link) over locators filtered by the trigger's visible text, which changes after
a selection and goes stale. Multi-select comboboxes keep the popover OPEN after
adding a pill — do NOT re-click the trigger to "reopen" (that toggles it
closed); add all items in one session, then Escape before touching the pills.
