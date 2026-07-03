# Punk-Zine Site-Wide Redesign — Design Spec

Date: 2026-07-02
Status: approved
Branch: `feat/punk-zine-site-redesign`

## Context

The signup/signin page shipped a "punk-zine flyer" aesthetic — tan paper card, hard
2px black borders, square corners, misregistered offset shadow in a per-page accent
color, washi tape, the hand-drawn FakeFourCutout display font, and ransom-note
heading images (torn colored paper/fabric strips served from the CDN). This design
extends that look site-wide so every page derives its design from its heading
image, with the accent (`--card-accent`) matching each heading strip's paper color.
Rounded corners disappear everywhere; media surfaces (video.js players, carousel
images, release covers) gain black borders and offset accent highlights; form
fields go punk globally; nav links without pages get placeholder pages; and the
auth flyer's background widens to full content width.

## Decisions (user-confirmed)

1. **Circles**: functionally-circular elements stay round — switch pills (existing
   deliberate exemption), radio indicators, spinners, circular progress. Everything
   else squares: avatars, badges, carousel dots, embla nav buttons, play-badge
   overlays, dialogs, cards, images, video.js transport buttons.
2. **Admin** (23 pages): inherits restyled primitives + global form styling + a
   kraft accent only. Text SectionHeaders and layouts unchanged.
3. **Extras in scope**: root `not-found.tsx` (NOT-FOUND.webp exists on the CDN),
   restyled `error.tsx`/`global-error.tsx` (ERROR.webp), chat drawer + chat UI
   (LIVE-CHAT.webp, orchid), and the legal pages' breadcrumb no longer links to the
   nonexistent `/legal` (non-clickable crumb).
4. **"Full page width"** = content-area width (the span of `ContentContainer`
   inside `main.xl:max-w-7xl`), not viewport bleed.
5. **Placeholder pages** (`/videos`, `/merch`, `/playlists`): TEXT headings in the
   FakeFourCutout font styled as paper strips — heading images will be supplied
   later and swapped in via `ImageHeading`.

## Accent map (sampled from the CDN heading images)

`--card-accent` drives offset shadows and focus rings; `--card-accent-soft` backs
chips and heading strips. New `@utility zine-accent-*` classes replace
`signin-accent`/`signup-accent`/`profile-accent`:

| Utility                | accent / soft                                 | Pages                                                                           |
| ---------------------- | --------------------------------------------- | ------------------------------------------------------------------------------- |
| `zine-accent-yellow`   | yellow-300 / yellow-200                       | `/` (FEATURED, #f8e848)                                                         |
| `zine-accent-hot-pink` | pink-400 / pink-200                           | `/artists` + detail/bio/search (#e82888)                                        |
| `zine-accent-pink`     | pink-300 / pink-200                           | `/about` (#f868a8), signin                                                      |
| `zine-accent-cyan`     | cyan-300 / cyan-200                           | `/releases` + detail (#48f8f8)                                                  |
| `zine-accent-tan`      | tan-300 / tan-200                             | `/tours` + detail (#e8c8a8)                                                     |
| `zine-accent-orange`   | orange-300 / orange-200                       | `/contact` (#f88848)                                                            |
| `zine-accent-green`    | green-300 / green-200                         | `/collection` (#78d878)                                                         |
| `zine-accent-teal`     | teal-300 / teal-200                           | signup, `/playlists` (#08e8b8)                                                  |
| `zine-accent-mustard`  | yellow-400 / yellow-300                       | `/merch` (#e8c858)                                                              |
| `zine-accent-kraft`    | oklch(0.53 0.035 73) / oklch(0.63 0.04 73)    | profile, success/\*, `/videos` (#987858), legal, admin, `/statuses`, `/offline` |
| `zine-accent-denim`    | ~oklch(0.45 0.03 255) / ~oklch(0.56 0.03 255) | 404 pages (#485868)                                                             |
| `zine-accent-storm`    | ~oklch(0.64 0.03 200) / ~oklch(0.74 0.03 200) | error pages (#789898)                                                           |
| `zine-accent-orchid`   | ~oklch(0.64 0.14 335) / ~oklch(0.74 0.11 335) | chat drawer (#c868b8)                                                           |

## Foundations

- **globals.css**: `--radius: 0rem` with literal `0rem` scale mappings; the
  `.profile-accent` punk field rules promoted to global unlayered rules
  (text-like inputs, textarea, `[role='combobox']`,
  `[data-slot='select-trigger']` → square, 2px black border, zinc-50 fill,
  accent focus ring; Radix switch/checkbox/radio untouched); `@theme` shadow
  tokens `--shadow-zine` (6px panels), `--shadow-zine-md` (4px CTAs),
  `--shadow-zine-sm` (3px buttons/tiles), `--shadow-zine-ink` (2px black chips);
  13 `zine-accent-*` utilities per the map.
- **`ZinePanel`** (`src/app/components/ui/zine-panel.tsx`): server-safe
  full-content-width paper panel (`bg-menu-item-tan-100`, square, `border-2
border-black`, `shadow-zine`), literal accent-class map, optional washi tape,
  padded inner wrapper.
- **`ZineHeading`** (`src/app/components/ui/zine-heading.tsx`): text heading
  rendered as a paper strip — FakeFourCutout, `-rotate-1`, `border-2 border-black`,
  `bg-[var(--card-accent-soft)]`, `shadow-zine-ink`, uppercase.
- **Button**: punk becomes the `default` variant (square, 2px black border,
  `shadow-zine-sm`, press-into-shadow); `punk` variant deleted;
  `destructive`/`outline`/`secondary` squared with black borders + ink shadows;
  `ghost`/`link` unchanged.
- **BreadcrumbMenu**: `isLink?: boolean` on items; non-link crumbs render a span.

## Page treatments

Every public page adopts the shell `PageContainer > ContentContainer >
BreadcrumbMenu > ZinePanel(accent)` with its heading image (or `ZineHeading`)
inside the panel. Auth keeps its form controls at `max-w-lg` centered inside the
now full-width panel. Tours pages migrate off their bespoke `container mx-auto`
shell. Media players and carousel/cover images get `border-2 border-black` plus
the ambient accent offset shadow; `videojs-audio.css` radii go to zero. Chat's
drawer carries the orchid accent on its portal content. Placeholder pages are
Server Components with metadata, a `ZineHeading`, short coming-soon copy, and a
punk button back to `/releases`.

## Testing & verification

- TDD per commit; the 9 spec files asserting radius classes update inside the
  primitive-sweep commit; exemption specs (spinners, status-indicator, logo,
  backdrop) stay untouched as regression guards.
- New specs: zine-panel, zine-heading, placeholder pages, root not-found, legal
  pages, error/global-error, plus per-page spec updates.
- New E2E: placeholder-pages and root-404 flows; full suite re-run at checkpoints
  (Docker Mongo harness only).
- Gates before every commit: `pnpm run typecheck && pnpm run test:run && pnpm run
lint && pnpm run format`; coverage must not regress the COVERAGE_METRICS.md
  baseline.
- Lighthouse before/after on `/`, `/releases`, `/artists`, `/signup`, `/contact`
  against a standalone build with a clean allowlisted env; FakeFourCutout woff2
  preloaded in the root layout (`crossOrigin="anonymous"`).

## Out of scope

- Swapping placeholder `ZineHeading`s for heading images (user supplies images in
  a follow-up).
- Stripping the ~47 vestigial `dark:` utilities (only cleaned on lines already
  being rewritten).
- Admin flyer panels / cutout admin headings.
