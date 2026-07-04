# Desktop Zine Frame: Full-Bleed Header/Footer, Consolidated Nav, Kraft Gutters — Design

Date: 2026-07-04
Status: Approved (visual-companion brainstorming session; final composite signed off)

## Context

The punk-zine redesign (PR #550) restyled page content but left the desktop chrome
inherited from the old layout: a 224px sticky header whose container — background,
border, and a `0 0 30px` black glow — is capped at `xl:max-w-7xl`, so the glow
spills sideways onto the white gutters; a footer whose background is already
full-bleed but whose content sits at `max-w-480` (1920px), wider than the header's
1280px; and dead-white gutters left and right of the constrained content column.

This design makes the desktop chrome match the zine language: full-bleed
header/footer backgrounds with content constrained to one shared 1280px column, a
halved header with a consolidated dropdown nav, and gutters treated as the kraft
surface the white "zine page" lies on.

## Scope

- **Desktop only (`xl:` ≥ 1280px).** Mobile (< 768px) and tablet/`md` (768–1279px)
  render pixel-identical to today. The existing CSS-only `contents` ↔ `hidden`
  desktop/mobile chrome toggle is preserved.
- **Admin pages inherit** the new chrome (shared root layout). Accepted.
- **No content change**: zine panel widths, page layouts, and `main`'s
  `xl:max-w-7xl` cap are untouched. The gutter treatment is purely additive.

## Visual design (binding numbers)

### Header — full-bleed two-deck masthead

- Container spans the viewport; starfield tile + pulse animation + sparkles span
  with it. Sticky, `z-40`, `overflow-hidden`, white bottom border (`xl:border-b-2
border-b-zinc-50`) all preserved.
- The side glow artifact is eliminated by construction; at `xl` the glow shadow is
  dropped entirely (`xl:shadow-none`). Below `xl` the current shadow stays.
- Bar height at `xl`: **128px** (`h-32`), down from 224px (`h-56`). Heights below
  `xl` unchanged (58px / 122px).
- Content layer capped at **`xl:max-w-7xl` (1280px)**, centered — replacing the
  current `xl:max-w-480` (1920px), which would otherwise let content drift outward
  once the container goes full-bleed.
- **Hand logo**: 96px disc (`size-24`, up from a 56px comp, down from today's
  144px), `left-8` (32px) inside the content column, vertically centered across
  the bar: **16px above and below** (`top-4`). Hard ink shadow
  (`shadow-zine-ink`-style, black) so it sits like a sticker. White disc backing
  kept.
- **Wordmark** (`fake-four-inc-words-sans-hand.webp`, natural 444×40): rendered at
  **48px tall** (+20%), horizontally centered, positioned so the gap above it
  (viewport top → wordmark) equals the gap below it (wordmark → nav top):
  **18px / 18px** given nav top at 84px.
- **Nav row** (deck two): top edge at **84px**, single line, cutout font at the
  full **24px** (`text-2xl`), white, diamond bullets between items (current
  style). Item colors on hover/active per `useNavMenuItems` palette, unchanged.
- **Auth menu**: unchanged content (sign in/up; sign out · @username · admin),
  pinned top-right of the content column (`top-6 right-10` family), cutout 18px.

### Nav information architecture

Top level (signed out): **Home · Music ▾ · Label ▾ · Contact Us**
Top level (signed in): **Home · Music ▾ · Label ▾ · My Collection · Contact Us**

- **Music ▾** → Releases, Artists, Playlists, Videos (this order).
- **Label ▾** → Tours, Merch, About (this order).
- Home and Contact Us are permanently top-level (product owner directive).
- My Collection appears top-level only when authenticated (as today).
- Trigger hover/active palette colors: **Music ▾ inherits Releases' cyan ramp**,
  **Label ▾ inherits Tours' tan ramp** (each group wears its lead item's color);
  all other top-level items keep their current colors.
- The admin link stays in the auth menu, not the main nav (as today).
- Mobile hamburger sheet keeps the current **flat** list — grouping is a desktop
  projection only.

**Hard constraint — logo/nav clearance**: the nav row carries symmetric
**152px horizontal insets** (logo 32px offset + 96px width + 24px breathing).
Symmetry preserves true centering; the insets make logo/"Home" overlap
geometrically impossible at every `xl` viewport, including after future item
additions (the row wraps into extra height rather than colliding).

### Dropdown drawers

- Panel styled as a taped-on paper scrap: `bg-menu-item-tan-100` paper, 2px black
  border, square corners, offset accent shadow (`shadow-zine-sm`; yellow accent
  for Music, pink for Label), ~1.5° rotation (alternating sign per drawer), tape
  chip centered on the top edge (matching `ZinePanel`'s tape).
- Items: cutout font ~22px, near-black on paper, dashed separators, inverted
  (black bg / paper text) hover+focus state. Inside a drawer the per-item palette
  colors do not apply — drawer items are ink-on-paper by design; the active
  (`aria-current="page"`) item is underlined in ink.
- Behavior: opens on **hover and click**; full keyboard support (Enter/Space
  open, arrows navigate, Escape closes), `aria-expanded` on triggers, outside
  click closes. Built on the existing shadcn/Radix menu primitives — no new UI
  primitive. Radix NavigationMenu panels render inline (no portal); the header's overflow
  clipping moves to the backdrop layer (Task: masthead geometry) so drawers are
  never clipped — same guarantee, different mechanism.
- Active trail: a trigger renders the active (underlined) state when the current
  route matches any child (e.g. Music underlined on `/releases`), using
  `isActiveHref` semantics. Child items keep `aria-current="page"` styling.
- Drawer links preserve the `unstable_dynamicOnHover` prefetch boost.

### Footer

- Background at `xl`: **starfield tile repeat on black — identical to the
  header** — replacing particles-6.svg at that breakpoint. Below `xl`: unchanged
  (zinc-950 + particles).
- **White top border at `xl`** (`xl:border-t-2 border-t-zinc-50`), mirroring the
  header's bottom border so the two bars frame the page.
- Content narrowed from `max-w-480` to **`xl:max-w-7xl`**, centered — the same
  column as header content and `main`. Internal layout (© row left, legal links
  right, separators) unchanged. `min-h-23` unchanged.

### Gutters — kraft desk + torn page edges

- Between header and footer, outside the 1280px column, at `xl` only (below
  1280px viewport width the gutters have zero width — desktop-only by
  construction).
- **Kraft surface**: warm kraft paper tone, starting value `#d7ccb4`
  (oklch ≈ 0.84 0.03 85 — kin to the tan/kraft accent ramp), with fine photocopy
  grain (inline SVG `feTurbulence` data-URI at ~9% opacity). Painted on `body` at
  `xl`. The tone may be tuned during screenshot review only within this warm
  kraft family — not toward gray or dark.
- **Torn edges**: the white content column reads as a torn-out sheet — jagged
  white/kraft tear silhouettes run down both edges of `main`, implemented as
  `repeat-y` SVG data-URI background layers **inside** `main`'s box (≈14px wide,
  ~140px vertical period, mirrored left/right), with `main` gaining `xl:bg-white`
  to stay an opaque sheet. No new DOM, nothing escapes `overflow-x-clip`.
- The content column itself stays exactly as white as today; panels and text
  never sit on texture.
- Known accepted limitation: at 1280–1366px viewports the gutters are ≤ 43px
  slivers — kraft tone shows, tear detail is largely hidden.

### Spacing

- First-content gap (header → banner ticker/strip) and section rhythm re-tuned
  for the 128px header during implementation, verified against rendered
  screenshots. Contentious spacing calls go back to the product owner rather
  than being decided silently.

## Technical design

- **`src/app/components/header/header.tsx`**: drop `mx-auto xl:max-w-7xl` from
  `HeaderContainer` usage (container goes full-bleed).
- **`header-container.tsx`**: `xl:shadow-none`; keep sticky/z/overflow/border.
- **`header-content.tsx`**: `xl:h-32` (from `xl:h-56`), `xl:max-w-7xl` (from
  `xl:max-w-480`).
- **`header-desktop.tsx`**: rebuilt two-deck composition (logo, wordmark at
  `top-[18px] h-12`, auth, nav row at `top-[84px] inset-x-0 px-38`).
- **`logo.tsx`**: desktop classes → `xl:size-24 xl:top-4 xl:left-8` + ink shadow.
- **`desktop-menu.tsx`**: consumes the new grouped hook; renders flat links and
  drawer triggers; new sibling component for the drawer
  (`desktop-menu-drawer.tsx`) wrapping the shadcn/Radix menu primitive.
- **New hook `use-nav-menu-groups.ts`**: desktop projection built on top of the
  existing flat `useNavMenuItems` (single source of truth preserved; mobile sheet
  keeps consuming the flat hook unchanged). Returns
  `Array<NavMenuEntry>` where an entry is a link or a
  `{ label, items }` group — typed, exported, spec'd.
- **`footer.tsx`**: `xl:` background swap to starfield, `xl:border-t-2`,
  content `xl:max-w-7xl`.
- **`layout.tsx` + `globals.css`**: `zine-desk` utility (kraft + grain) applied
  to `body` at `xl`; `zine-page-edges` utility (white fill + torn-edge layers)
  applied to `main` at `xl`. Pure CSS/SVG data-URIs — no image requests, no JS,
  no animation.
- **Banner strip/ticker**: untouched except spacing context.
- **Assets**: zero new downloads. The footer reuses the header's already-cached
  starfield tile; grain and tears are inline data-URIs.

## Accessibility

- Radix menu semantics: keyboard operable, `aria-expanded`, focus management,
  Escape/outside close.
- `aria-current="page"` preserved on links; triggers additionally show the
  active-trail underline.
- Decorative layers (kraft, grain, tears, sparkles) are CSS backgrounds or
  `aria-hidden` — no assistive-tech surface.
- Focus-visible rings keep using `--card-accent` per the existing form/control
  convention.

## Testing

- **TDD throughout** (repo rule): failing spec first, then implementation.
- New unit specs: `use-nav-menu-groups.spec.ts` (grouping, order, conditional
  My Collection, Home/Contact pinning), `desktop-menu-drawer.spec.tsx` (open on
  hover/click, keyboard, aria-expanded, active trail), updated
  `desktop-menu.spec.tsx`, `header-content`/`header-container`/`logo`/`footer`
  spec updates for the class/geometry changes.
- **E2E (Playwright)**: every flow that navigates via top-nav links to Releases,
  Artists, Tours, Merch, Playlists, Videos, or About must open the owning drawer
  first — add a drawer-aware `navigateTo` helper to the page objects and migrate
  call sites. Mobile-sheet nav flows untouched. E2E runs only against the
  isolated Docker MongoDB per AGENTS.md (hard constraint).
- Coverage must not regress the `COVERAGE_METRICS.md` baseline; gate is
  `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format`
  before every commit.

## Rollout

Atomic commits on `feat/desktop-zine-frame` (worktree off `main`), roughly:
nav data hook → header chrome → drawers → footer → gutters → spacing/E2E
migration. Single PR to `main` when the full gate and E2E are green.

## Out of scope / explicitly rejected

- Body-wide background texture (rejected — texture is gutters-only).
- Ticker-height (~52–64px) header (rejected — costs the wordmark).
- Pinning header height to the banner strip (rejected — strip height varies with
  live banner count, 122–244px; 128px is a fixed spec).
- Mobile/tablet chrome changes, checkbox-style controls, new UI primitives.
