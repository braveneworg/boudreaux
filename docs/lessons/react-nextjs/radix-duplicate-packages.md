# Duplicate @radix-ui/\* instances break stack-coordinated features

Radix features that coordinate through module-level stacks (FocusScope
pause/resume, DismissableLayer Escape layering) silently break when pnpm
resolves duplicate `@radix-ui/*` instances (e.g. vaul pinning an older
react-dialog): the drawer's focus trap then steals focus from any portaled
popover input. Check `pnpm dedupe --check` / `pnpm why
@radix-ui/react-focus-scope` before blaming component props; only an E2E
`toBeFocused` assertion catches the regression (jsdom unit tests render the
popover in isolation and pass).
