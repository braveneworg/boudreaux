# better-tailwindcss: Wire-up & Latent Bugs Fixed

> Branch: `refactor/update-eslint-with-function-and-component-rules`. Records the
> `eslint-plugin-better-tailwindcss` enablement in the flat config and the
> pre-existing invalid-class bugs its diagnostic run surfaced — all now fixed.

## What's enabled

Registered in `eslint.config.mjs`, scoped to `src/app/**`, with the Tailwind v4
`entryPoint` pointing at `src/app/globals.css`. **Validation rules only** — class
ordering/formatting stays with `prettier-plugin-tailwindcss` (`prettier.config.js`),
so the stylistic rules are intentionally omitted to avoid fighting Prettier.

| Rule                     | Severity | Notes                                      |
| ------------------------ | -------- | ------------------------------------------ |
| `no-conflicting-classes` | error    | —                                          |
| `no-duplicate-classes`   | error    | one dup auto-fixed (`bg-destructive`)      |
| `no-deprecated-classes`  | error    | v3→v4 renames auto-fixed; visually neutral |
| `no-unknown-classes`     | error    | scoped — see below                         |

### `no-unknown-classes` scoping

- **Allowlist** (`ignore`, anchored regexes) for genuine non-Tailwind classes the
  resolver can't know about:
  - `^vjs-` — video.js skin classes
  - `^audio-player-wrapper$` — the video.js player-container hook (carries
    `data-vjs-player`; also queried in tests)
  - `^toaster$` — sonner's wrapper class
  - `^banner-strip-slide$` — banner animation marker (its `@keyframes` live in
    `globals.css`; the animation is applied via inline `style`)
- **Spec override** — `no-unknown-classes` is `off` for `**/*.spec.{js,jsx,ts,tsx}`,
  because tests pass placeholder classNames (`custom-class`, `class1`, …) to assert
  className plumbing.

## Resolved — invalid `text-zinc-950-foreground` (204 occurrences)

`text-zinc-950-foreground` is not a valid class (it compiles to nothing) and had
propagated to **204** spots across ~70 files via copy-paste. Replaced everywhere
with **`text-zinc-950`**:

- The app has no `.dark` theme block, and `--foreground` is
  `oklch(0.141 0.005 285.823)` — i.e. zinc-950 — so `text-zinc-950` renders
  identically to the foreground color in the only mode that exists. This pins the
  current (inherited) appearance rather than risking a visual shift.
- Two specs that asserted the old class were updated in lockstep
  (`username-link.spec.tsx`, `loading-spinner.spec.tsx`).

> Origin: `git log -S"text-zinc-950-foreground"` shows it was copy-pasted across
> many feature commits over time — a latent typo that propagated, not one regression.

## Resolved — latent bugs caught by `no-unknown-classes`

Each was an invalid class compiling to nothing; fixed to the project's existing
convention (or removed where inert):

| Was                                                                                              | Now                                                         | Where                                                            |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------- |
| `text-destructive-foreground` ×4 (`--destructive-foreground` is undefined)                       | `text-white` (matches `button.tsx`/`badge.tsx` destructive) | `cover-art-field`, `image-uploader` ×2, `media-uploader` (hover) |
| `border-radius-[0.5rem]` ×2 (a CSS property, not a utility)                                      | `rounded-[0.5rem]`                                          | `carousel-number-up`, `media-player`                             |
| `origin-top-center` (no such utility)                                                            | `origin-top`                                                | `navigation-menu`                                                |
| `border-b-px` (no such utility)                                                                  | `border-b`                                                  | `header-content`                                                 |
| `space-0` (no such utility)                                                                      | removed (no-op; flex has no default gap)                    | `checkbox-field` (+ its spec)                                    |
| `:hover:no-underline :visited:text-rebeccapurple` (malformed leading colons + placeholder color) | `hover:no-underline`                                        | `signup-signin-form`                                             |
| `responsive` (stray; the video.js `responsive: true` _option_ is separate)                       | removed                                                     | `audio-player`                                                   |
| `prose prose-zinc dark:prose-invert` (typography plugin not installed → inert)                   | removed                                                     | `artist-bio-content` — see below                                 |

### Note — article typography is currently absent

`artist-bio-content.tsx` used `prose*` classes, but `@tailwindcss/typography` is
not installed and not loaded in `globals.css`, so they were **inert** (the bio's
`[&_h2]`/`[&_h3]` arbitrary selectors still apply). The inert classes were removed
with no visual change. If rich article typography is wanted, that's a separate
enhancement: add `@tailwindcss/typography`, register it with
`@plugin "@tailwindcss/typography";` in `globals.css`, then reinstate
`prose prose-zinc` (and `dark:prose-invert` if/when a dark theme exists).
