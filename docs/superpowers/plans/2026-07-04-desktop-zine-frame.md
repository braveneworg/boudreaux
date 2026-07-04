# Desktop Zine Frame Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full-bleed desktop header/footer with a 128px two-deck masthead, Music ▾ / Label ▾ drawer nav, matched footer, and kraft gutters with torn page edges — per `docs/superpowers/specs/2026-07-04-desktop-zine-frame-design.md`.

**Architecture:** All changes gate behind `xl:` (≥1280px); mobile/tablet render pixel-identical. The header container goes full-bleed while content re-caps at `max-w-7xl`; overflow clipping moves from the container to the backdrop layer so Radix NavigationMenu drawers (which do NOT portal) can overhang the bar. Nav grouping is a desktop-only projection (`useNavMenuGroups`) over the existing flat `useNavMenuItems` (mobile keeps the flat hook). Gutters are pure-CSS utilities (kraft + grain on `body`, white sheet + torn-edge tiles on `main`).

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4 (`@utility`), shadcn/Radix `NavigationMenu` (`@/ui/navigation-menu`, already present), Vitest 4 + Testing Library, Playwright.

## Global Constraints

- TDD: write the failing spec first, watch it fail, then implement. `describe`/`it`/`expect`/`vi` are globals — never import from `vitest`.
- Gate before every commit: `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format`.
- Commits: `type(scope): <gitmoji> subject` ≤50 chars; no Co-authored-by/AI lines; never commit to `main` (we are on `feat/desktop-zine-frame`).
- Never suppress lint/type errors; no `any`; no non-null `!`; arrow functions; named exports (App Router default-export files exempt).
- New source files start with the MPL header from `HEADER.txt`.
- Tailwind literal classes only — never template-build class names.
- E2E only against Docker Mongo `mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0` (`pnpm run e2e:docker:up`); never read `.env*`.
- Binding visual numbers live in the spec: bar `xl:h-32` (128px); logo `xl:size-24 xl:top-4 xl:left-8` + ink shadow; wordmark `h-12` at `top-[18px]`; nav row `top-21` (84px) with symmetric `px-38` (152px) insets; content caps `xl:max-w-7xl`.

---

### Task 1: `useNavMenuGroups` hook

**Files:**

- Create: `src/app/hooks/use-nav-menu-groups.ts`
- Test: `src/app/hooks/use-nav-menu-groups.spec.ts`

**Interfaces:**

- Consumes: `useNavMenuItems`, `NavMenuItem` from `@/hooks/use-nav-menu-items`.
- Produces (later tasks rely on these exact names):

```ts
export interface NavMenuGroup {
  label: string; // 'Music' | 'Label'
  color: string; // Tailwind hover/active classes inherited from the lead item
  items: NavMenuItem[];
}
export type NavMenuEntry =
  | { kind: 'link'; item: NavMenuItem }
  | { kind: 'group'; group: NavMenuGroup };
export const useNavMenuGroups: () => NavMenuEntry[];
```

- [ ] **Step 1: Write the failing test**

`src/app/hooks/use-nav-menu-groups.spec.ts` (MPL header on top, as in `use-nav-menu-items.ts`):

```ts
import { renderHook } from '@testing-library/react';

import { useNavMenuGroups } from './use-nav-menu-groups';

const mockUseNavMenuItems = vi.fn();

vi.mock('./use-nav-menu-items', () => ({
  useNavMenuItems: () => mockUseNavMenuItems(),
}));

const item = (name: string, href: string, color = `${name}-color`) => ({
  name,
  href,
  hasBullet: true,
  color,
});

const FLAT_SIGNED_OUT = [
  item('Home', '/'),
  item('Artists', '/artists'),
  item('Releases', '/releases', 'releases-cyan'),
  item('Videos', '/videos'),
  item('Tours', '/tours', 'tours-tan'),
  item('Merch', '/merch'),
  item('Playlists', '/playlists'),
  item('About', '/about'),
  item('Contact Us', '/contact'),
];

describe('useNavMenuGroups', () => {
  it('projects the flat items into Home · Music ▾ · Label ▾ · Contact Us', () => {
    mockUseNavMenuItems.mockReturnValue(FLAT_SIGNED_OUT);

    const { result } = renderHook(() => useNavMenuGroups());

    expect(result.current).toHaveLength(4);
    expect(result.current[0]).toMatchObject({ kind: 'link', item: { name: 'Home' } });
    expect(result.current[1]).toMatchObject({ kind: 'group', group: { label: 'Music' } });
    expect(result.current[2]).toMatchObject({ kind: 'group', group: { label: 'Label' } });
    expect(result.current[3]).toMatchObject({ kind: 'link', item: { name: 'Contact Us' } });
  });

  it('orders Music as Releases, Artists, Playlists, Videos', () => {
    mockUseNavMenuItems.mockReturnValue(FLAT_SIGNED_OUT);

    const { result } = renderHook(() => useNavMenuGroups());
    const music = result.current[1];

    if (music?.kind !== 'group') throw new Error('expected Music group');
    expect(music.group.items.map((i) => i.name)).toEqual([
      'Releases',
      'Artists',
      'Playlists',
      'Videos',
    ]);
  });

  it('orders Label as Tours, Merch, About', () => {
    mockUseNavMenuItems.mockReturnValue(FLAT_SIGNED_OUT);

    const { result } = renderHook(() => useNavMenuGroups());
    const label = result.current[2];

    if (label?.kind !== 'group') throw new Error('expected Label group');
    expect(label.group.items.map((i) => i.name)).toEqual(['Tours', 'Merch', 'About']);
  });

  it('gives each trigger its lead item color (Music→Releases, Label→Tours)', () => {
    mockUseNavMenuItems.mockReturnValue(FLAT_SIGNED_OUT);

    const { result } = renderHook(() => useNavMenuGroups());
    const [, music, label] = result.current;

    if (music?.kind !== 'group' || label?.kind !== 'group') throw new Error('expected groups');
    expect(music.group.color).toBe('releases-cyan');
    expect(label.group.color).toBe('tours-tan');
  });

  it('inserts My Collection top-level before Contact Us when present', () => {
    mockUseNavMenuItems.mockReturnValue([
      ...FLAT_SIGNED_OUT.slice(0, 3),
      item('My Collection', '/collection'),
      ...FLAT_SIGNED_OUT.slice(3),
    ]);

    const { result } = renderHook(() => useNavMenuGroups());

    expect(result.current.map((e) => (e.kind === 'link' ? e.item.name : e.group.label))).toEqual([
      'Home',
      'Music',
      'Label',
      'My Collection',
      'Contact Us',
    ]);
  });

  it('skips a group member absent from the flat list without crashing', () => {
    mockUseNavMenuItems.mockReturnValue(FLAT_SIGNED_OUT.filter((i) => i.href !== '/videos'));

    const { result } = renderHook(() => useNavMenuGroups());
    const music = result.current[1];

    if (music?.kind !== 'group') throw new Error('expected Music group');
    expect(music.group.items.map((i) => i.name)).toEqual(['Releases', 'Artists', 'Playlists']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/app/hooks/use-nav-menu-groups.spec.ts`
Expected: FAIL — `Cannot find module './use-nav-menu-groups'`.

- [ ] **Step 3: Write the implementation**

`src/app/hooks/use-nav-menu-groups.ts` (MPL header on top):

```ts
'use client';

import { useMemo } from 'react';

import { useNavMenuItems, type NavMenuItem } from '@/hooks/use-nav-menu-items';

export interface NavMenuGroup {
  /** Trigger label rendered in the nav row. */
  label: string;
  /** Tailwind hover/active classes — the group wears its lead item's color. */
  color: string;
  /** Drawer links, in spec order. */
  items: NavMenuItem[];
}

export type NavMenuEntry =
  | { kind: 'link'; item: NavMenuItem }
  | { kind: 'group'; group: NavMenuGroup };

// Drawer membership by href (spec order). Hrefs are stabler than display names.
const MUSIC_HREFS = ['/releases', '/artists', '/playlists', '/videos'] as const;
const LABEL_HREFS = ['/tours', '/merch', '/about'] as const;

const pickGroup = (
  label: string,
  hrefs: readonly string[],
  byHref: Map<string, NavMenuItem>
): NavMenuEntry[] => {
  const items = hrefs.flatMap((href) => {
    const found = byHref.get(href);
    return found ? [found] : [];
  });
  const [lead] = items;
  return lead ? [{ kind: 'group', group: { label, color: lead.color, items } }] : [];
};

const pickLink = (href: string, byHref: Map<string, NavMenuItem>): NavMenuEntry[] => {
  const found = byHref.get(href);
  return found ? [{ kind: 'link', item: found }] : [];
};

/**
 * Desktop projection of the primary nav: Home · Music ▾ · Label ▾ ·
 * [My Collection] · Contact Us. Built on top of `useNavMenuItems` so the flat
 * list stays the single source of truth (the mobile sheet keeps consuming it
 * directly); conditional items (My Collection) appear here exactly when they
 * appear there.
 */
export const useNavMenuGroups = (): NavMenuEntry[] => {
  const items = useNavMenuItems();

  return useMemo(() => {
    const byHref = new Map(items.map((navItem) => [navItem.href, navItem]));
    return [
      ...pickLink('/', byHref),
      ...pickGroup('Music', MUSIC_HREFS, byHref),
      ...pickGroup('Label', LABEL_HREFS, byHref),
      ...pickLink('/collection', byHref),
      ...pickLink('/contact', byHref),
    ];
  }, [items]);
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/app/hooks/use-nav-menu-groups.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Gate and commit**

```bash
pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
git add src/app/hooks/use-nav-menu-groups.ts src/app/hooks/use-nav-menu-groups.spec.ts
git commit -m "feat: ✨ add desktop nav menu groups hook"
```

---

### Task 2: `DesktopMenuDrawer` — zine paper-scrap drawer

**Files:**

- Create: `src/app/components/desktop-menu-drawer.tsx`
- Test: `src/app/components/desktop-menu-drawer.spec.tsx`
- Modify: `docs/superpowers/specs/2026-07-04-desktop-zine-frame-design.md` (portal→clipping amendment, Step 6)

**Interfaces:**

- Consumes: `NavMenuGroup` (Task 1); `NavigationMenuItem/Trigger/Content` from `@/ui/navigation-menu`; `isActiveHref` from `@/utils/is-active-href`.
- Produces: `export const DesktopMenuDrawer: ({ group, pathname }: DesktopMenuDrawerProps) => React.ReactElement` — must be rendered inside a `NavigationMenu`/`NavigationMenuList` (Task 3 does).

**Design notes (why):** Radix `NavigationMenu` gives hover-open + click + full keyboard + `aria-expanded` for free, but its panels do NOT portal — they render inline. Task 4 therefore moves the header's overflow clipping onto the backdrop layer. Drawer accents are a literal map (Tailwind can't see template-built class names). `zine-accent-hot-pink` matches the approved mock's `#e04a8f` shadow.

- [ ] **Step 1: Write the failing test**

`src/app/components/desktop-menu-drawer.spec.tsx` (MPL header; the `next/link` mock mirrors `desktop-menu.spec.tsx`'s existing one):

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { NavigationMenu, NavigationMenuList } from '@/ui/navigation-menu';

import { DesktopMenuDrawer } from './desktop-menu-drawer';

import type { NavMenuGroup } from '@/hooks/use-nav-menu-groups';

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    prefetch,
    unstable_dynamicOnHover,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    prefetch?: boolean;
    unstable_dynamicOnHover?: boolean;
  }) => (
    <a
      href={href}
      data-prefetch={prefetch === undefined ? 'default' : String(prefetch)}
      data-dynamic-on-hover={String(unstable_dynamicOnHover === true)}
      {...props}
    >
      {children}
    </a>
  ),
}));

const MUSIC_GROUP: NavMenuGroup = {
  label: 'Music',
  color: 'hover:text-menu-item-cyan-400',
  items: [
    { name: 'Releases', href: '/releases', hasBullet: true, color: 'c1' },
    { name: 'Artists', href: '/artists', hasBullet: true, color: 'c2' },
  ],
};

const renderDrawer = (pathname = '/') =>
  render(
    <NavigationMenu viewport={false}>
      <NavigationMenuList>
        <DesktopMenuDrawer group={MUSIC_GROUP} pathname={pathname} />
      </NavigationMenuList>
    </NavigationMenu>
  );

describe('DesktopMenuDrawer', () => {
  it('renders a closed trigger with aria-expanded=false', () => {
    renderDrawer();

    const trigger = screen.getByRole('button', { name: /music/i });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens on click and reveals the drawer links with prefetch boost', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(screen.getByRole('button', { name: /music/i }));

    const releases = await screen.findByRole('link', { name: 'Releases' });
    expect(releases).toHaveAttribute('href', '/releases');
    expect(releases).toHaveAttribute('data-dynamic-on-hover', 'true');
    expect(screen.getByRole('link', { name: 'Artists' })).toHaveAttribute('href', '/artists');
    expect(screen.getByRole('button', { name: /music/i })).toHaveAttribute('aria-expanded', 'true');
  });

  it('marks the active child with aria-current=page', async () => {
    const user = userEvent.setup();
    renderDrawer('/releases/some-release');

    await user.click(screen.getByRole('button', { name: /music/i }));

    const releases = await screen.findByRole('link', { name: 'Releases' });
    expect(releases).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Artists' })).not.toHaveAttribute('aria-current');
  });

  it('underlines the trigger when a child route is active (active trail)', () => {
    renderDrawer('/artists/123');

    // Token-level check — a substring match would false-positive on
    // `underline-offset-8`.
    const tokens = screen.getByRole('button', { name: /music/i }).className.split(/\s+/);
    expect(tokens).toContain('underline');
  });

  it('does not underline the trigger on unrelated routes', () => {
    renderDrawer('/tours');

    const tokens = screen.getByRole('button', { name: /music/i }).className.split(/\s+/);
    expect(tokens).not.toContain('underline');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/app/components/desktop-menu-drawer.spec.tsx`
Expected: FAIL — `Cannot find module './desktop-menu-drawer'`.

- [ ] **Step 3: Write the implementation**

`src/app/components/desktop-menu-drawer.tsx` (MPL header on top):

```tsx
'use client';

import Link from 'next/link';

import { isActiveHref } from '@/lib/utils/is-active-href';
import { cn } from '@/lib/utils';
import {
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuTrigger,
} from '@/ui/navigation-menu';

import type { NavMenuGroup } from '@/hooks/use-nav-menu-groups';

/**
 * Per-drawer paper-scrap accent + tilt. Literal map — Tailwind only emits
 * classes it can see as full literals in source (same rule as ZinePanel's
 * ACCENT_CLASS). Accents match the approved comps: Music yellow, Label hot pink.
 */
const DRAWER_ACCENT_CLASS = new Map<string, string>([
  ['Music', 'zine-accent-yellow -rotate-[1.5deg]'],
  ['Label', 'zine-accent-hot-pink rotate-[1.5deg]'],
]);

export interface DesktopMenuDrawerProps {
  group: NavMenuGroup;
  /** Current pathname, threaded from the parent so the drawer stays presentational. */
  pathname: string;
}

/**
 * One grouped nav entry: a cutout-type trigger plus its taped-on paper-scrap
 * drawer. Radix NavigationMenu supplies hover/click open, keyboard support and
 * `aria-expanded`; panels render inline (no portal), so the header's overflow
 * clipping lives on the backdrop layer, not on any of the drawer's ancestors.
 * Trigger wears the group color and underlines while a child route is active.
 */
export const DesktopMenuDrawer = ({ group, pathname }: DesktopMenuDrawerProps) => {
  const isTrailActive = group.items.some((item) => isActiveHref(item.href, pathname));

  return (
    <NavigationMenuItem>
      <NavigationMenuTrigger
        className={cn(
          'h-auto w-auto bg-transparent p-0 text-2xl font-normal text-zinc-50 underline-offset-8',
          'hover:bg-transparent hover:underline focus:bg-transparent',
          'data-[state=open]:bg-transparent data-[state=open]:underline data-[state=open]:hover:bg-transparent data-[state=open]:focus:bg-transparent',
          group.color,
          isTrailActive && 'underline'
        )}
      >
        {group.label}
      </NavigationMenuTrigger>
      <NavigationMenuContent
        className={cn(
          'bg-menu-item-tan-100 shadow-zine-sm w-56 overflow-visible border-2 border-black p-0 pt-3 md:w-56',
          DRAWER_ACCENT_CLASS.get(group.label)
        )}
      >
        {/* Tape chip — same gesture as ZinePanel's. */}
        <span
          aria-hidden="true"
          className="bg-menu-item-yellow-200/85 absolute -top-3 left-1/2 z-20 h-6 w-24 -translate-x-1/2 -rotate-2 border border-black/25 shadow-[1px_1px_0_0_rgba(0,0,0,0.2)]"
        />
        <ul className="flex flex-col">
          {group.items.map((item) => {
            const isActive = isActiveHref(item.href, pathname);
            return (
              <li
                key={item.name}
                className="border-b-2 border-dashed border-black/15 last:border-b-0"
              >
                <NavigationMenuLink asChild active={isActive}>
                  {/* Drawer links are ink-on-paper by design (no per-item palette
                      colors inside the drawer); active child is underlined in ink. */}
                  <Link
                    href={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    unstable_dynamicOnHover
                    className="font-fake-four-cutout hover:text-menu-item-tan-100 focus:text-menu-item-tan-100 block px-4 py-2 text-[22px] text-zinc-950 underline-offset-4 hover:bg-zinc-950 focus:bg-zinc-950 aria-[current=page]:underline"
                  >
                    {item.name}
                  </Link>
                </NavigationMenuLink>
              </li>
            );
          })}
        </ul>
      </NavigationMenuContent>
    </NavigationMenuItem>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/app/components/desktop-menu-drawer.spec.tsx`
Expected: PASS (5 tests). If Radix warns about missing `ResizeObserver` in jsdom, mirror whatever `src/app/components/ui/navigation-menu.spec.tsx` already does — do not add new global polyfills unilaterally.

- [ ] **Step 5: Run the adjacent existing suite for regressions**

Run: `pnpm exec vitest run src/app/components/ui/navigation-menu.spec.tsx`
Expected: PASS (unchanged file, sanity check the primitive still behaves).

- [ ] **Step 6: Amend the spec's portal sentence**

In `docs/superpowers/specs/2026-07-04-desktop-zine-frame-design.md`, replace the sentence

```
Panels portal to `body` so the header's `overflow-hidden` never clips them.
```

with

```
Radix NavigationMenu panels render inline (no portal); the header's overflow
clipping moves to the backdrop layer (Task: masthead geometry) so drawers are
never clipped — same guarantee, different mechanism.
```

- [ ] **Step 7: Gate and commit**

```bash
pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
git add src/app/components/desktop-menu-drawer.tsx src/app/components/desktop-menu-drawer.spec.tsx docs/superpowers/specs/2026-07-04-desktop-zine-frame-design.md
git commit -m "feat: ✨ add zine paper-scrap nav drawer"
```

---

### Task 3: Rebuild `DesktopMenu` on the grouped hook

**Files:**

- Modify: `src/app/components/desktop-menu.tsx` (full rewrite below)
- Modify: `src/app/components/desktop-menu.spec.tsx` (full rewrite below)

**Interfaces:**

- Consumes: `useNavMenuGroups`/`NavMenuEntry` (Task 1), `DesktopMenuDrawer` (Task 2), `NavigationMenu*` primitives.
- Produces: `export const DesktopMenu: () => React.ReactElement` — same export name/signature as today; `HeaderDesktop` keeps rendering `<DesktopMenu />` unchanged in Task 4.

**Positioning contract (spec):** nav row `absolute inset-x-0 top-21 z-50` with symmetric `px-38` (152px) insets inside the 1280px header content; single line at `text-2xl`, wrapping allowed as safety valve; diamond bullets between top-level entries only.

- [ ] **Step 1: Rewrite the spec file as the failing test**

Replace the entire body of `src/app/components/desktop-menu.spec.tsx` with (keep the MPL header and the existing `next/link` mock verbatim from the current file — it is already exactly what we need):

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DesktopMenu } from './desktop-menu';

const mockUseSession = vi.fn();
const mockUsePathname = vi.fn();

vi.mock('@/app/hooks/use-session', () => ({
  useSession: () => mockUseSession(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

// (existing next/link mock from the current spec file goes here, unchanged)

describe('DesktopMenu', () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue('/');
  });

  describe('unauthenticated', () => {
    beforeEach(() => {
      mockUseSession.mockReturnValue({ status: 'unauthenticated' });
    });

    it('renders Home and Contact Us as always-visible links', () => {
      render(<DesktopMenu />);

      expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
      expect(screen.getByRole('link', { name: 'Contact Us' })).toHaveAttribute('href', '/contact');
    });

    it('renders Music and Label as drawer triggers, not links', () => {
      render(<DesktopMenu />);

      expect(screen.getByRole('button', { name: /music/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /label/i })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Releases' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Tours' })).not.toBeInTheDocument();
    });

    it('reveals the Music drawer links on trigger click', async () => {
      const user = userEvent.setup();
      render(<DesktopMenu />);

      await user.click(screen.getByRole('button', { name: /music/i }));

      expect(await screen.findByRole('link', { name: 'Releases' })).toHaveAttribute(
        'href',
        '/releases'
      );
      expect(screen.getByRole('link', { name: 'Artists' })).toHaveAttribute('href', '/artists');
      expect(screen.getByRole('link', { name: 'Playlists' })).toHaveAttribute('href', '/playlists');
      expect(screen.getByRole('link', { name: 'Videos' })).toHaveAttribute('href', '/videos');
    });

    it('reveals the Label drawer links on trigger click', async () => {
      const user = userEvent.setup();
      render(<DesktopMenu />);

      await user.click(screen.getByRole('button', { name: /label/i }));

      expect(await screen.findByRole('link', { name: 'Tours' })).toHaveAttribute('href', '/tours');
      expect(screen.getByRole('link', { name: 'Merch' })).toHaveAttribute('href', '/merch');
      expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about');
    });

    it('does not render My Collection anywhere', () => {
      render(<DesktopMenu />);

      expect(screen.queryByRole('link', { name: 'My Collection' })).not.toBeInTheDocument();
    });

    it('marks Home with aria-current on the root route', () => {
      render(<DesktopMenu />);

      expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    });

    it('applies the dynamic-on-hover prefetch boost to top-level links', () => {
      render(<DesktopMenu />);

      expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
        'data-dynamic-on-hover',
        'true'
      );
    });
  });

  describe('authenticated', () => {
    beforeEach(() => {
      mockUseSession.mockReturnValue({ status: 'authenticated' });
    });

    it('renders My Collection top-level between Label and Contact Us', () => {
      render(<DesktopMenu />);

      const topLevel = screen
        .getAllByRole('listitem')
        .map((li) => li.textContent ?? '')
        .filter((text) => text.length > 0);
      const collectionIndex = topLevel.findIndex((t) => t.includes('My Collection'));
      const labelIndex = topLevel.findIndex((t) => t.includes('Label'));
      const contactIndex = topLevel.findIndex((t) => t.includes('Contact Us'));

      expect(collectionIndex).toBeGreaterThan(labelIndex);
      expect(collectionIndex).toBeLessThan(contactIndex);
      expect(screen.getByRole('link', { name: 'My Collection' })).toHaveAttribute(
        'href',
        '/collection'
      );
    });
  });
});
```

Note: `useNavMenuItems` mount-gates auth (`hasMounted`), so authenticated rendering needs the post-mount state — Testing Library's `render` flushes effects, and the existing `desktop-menu.spec.tsx` already exercises the authenticated branch this way; if the My Collection assertion flakes, wrap the queries in `await screen.findByRole(...)`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/app/components/desktop-menu.spec.tsx`
Expected: FAIL — old implementation renders flat links (`button Music` not found).

- [ ] **Step 3: Rewrite the implementation**

Replace `src/app/components/desktop-menu.tsx` entirely (MPL header on top):

```tsx
'use client';
import { Fragment } from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useNavMenuGroups } from '@/hooks/use-nav-menu-groups';
import { isActiveHref } from '@/lib/utils/is-active-href';
import { cn } from '@/lib/utils';
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from '@/ui/navigation-menu';

import { DesktopMenuDrawer } from './desktop-menu-drawer';

/** Diamond separator between top-level entries (decorative, as before). */
const Bullet = () => (
  <li className="flex self-center" role="presentation" aria-hidden="true">
    <span className="block size-2 rotate-45 bg-zinc-50" />
  </li>
);

/**
 * Desktop primary nav (deck two of the masthead): Home · Music ▾ · Label ▾ ·
 * [My Collection] · Contact Us at full cutout scale. Symmetric `px-38` (152px)
 * insets keep true centering while making logo/"Home" overlap geometrically
 * impossible at every xl viewport — the row wraps instead of colliding.
 */
export const DesktopMenu = () => {
  const pathname = usePathname();
  const entries = useNavMenuGroups();

  return (
    <NavigationMenu
      viewport={false}
      delayDuration={150}
      className="font-fake-four-cutout absolute inset-x-0 top-21 z-50 max-w-none justify-center px-38 text-2xl"
    >
      <NavigationMenuList className="flex-wrap justify-center gap-x-5 gap-y-4">
        {entries.map((entry, index) => (
          <Fragment key={entry.kind === 'link' ? entry.item.name : entry.group.label}>
            {entry.kind === 'link' ? (
              <NavigationMenuItem>
                <NavigationMenuLink asChild active={isActiveHref(entry.item.href, pathname)}>
                  <Link
                    href={entry.item.href}
                    aria-current={isActiveHref(entry.item.href, pathname) ? 'page' : undefined}
                    // Static nav targets fully prefetch on viewport by default;
                    // the hover boost upgrades force-dynamic ones (home) to a
                    // full data prefetch the moment pointer intent shows.
                    unstable_dynamicOnHover
                    className={cn(
                      'bg-transparent p-0 text-2xl text-zinc-50 underline-offset-8 transition-colors duration-200',
                      'hover:bg-transparent hover:underline focus:bg-transparent',
                      'aria-[current=page]:underline',
                      entry.item.color
                    )}
                  >
                    {entry.item.name}
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
            ) : (
              <DesktopMenuDrawer group={entry.group} pathname={pathname} />
            )}
            {index < entries.length - 1 && <Bullet />}
          </Fragment>
        ))}
      </NavigationMenuList>
    </NavigationMenu>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/app/components/desktop-menu.spec.tsx src/app/components/desktop-menu-drawer.spec.tsx`
Expected: PASS (both files).

- [ ] **Step 5: Gate and commit**

```bash
pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
git add src/app/components/desktop-menu.tsx src/app/components/desktop-menu.spec.tsx
git commit -m "feat: ✨ group desktop nav into Music/Label drawers"
```

---

### Task 4: Masthead geometry — full-bleed bar, 128px, logo/wordmark

**Files:**

- Modify: `src/app/components/header/header.tsx`
- Modify: `src/app/components/header/header-container.tsx`
- Modify: `src/app/components/header/header-content.tsx`
- Modify: `src/app/components/header/header-backdrop.tsx`
- Modify: `src/app/components/header/header-desktop.tsx`
- Modify: `src/app/components/header/logo.tsx`
- Test: the six adjacent `.spec.tsx` files (assertions below)

**Interfaces:**

- Consumes: `DesktopMenu` (Task 3), existing `DesktopAuthMenu`, `HeaderMobile`.
- Produces: the final masthead DOM. No export signatures change.

**Class-level changes (exact):**

| File                   | From                                                 | To                                                                                                        |
| ---------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `header.tsx`           | `<HeaderContainer className="mx-auto xl:max-w-7xl">` | `<HeaderContainer>`                                                                                       |
| `header-container.tsx` | `overflow-hidden shadow-[0_0_30px_0_rgba(0,0,0,1)]`  | `overflow-hidden xl:overflow-visible shadow-[0_0_30px_0_rgba(0,0,0,1)] xl:shadow-none`                    |
| `header-content.tsx`   | `xl:h-56 xl:max-w-480` and `overflow-hidden`         | `xl:h-32 xl:max-w-7xl` and `overflow-hidden xl:overflow-visible`                                          |
| `header-backdrop.tsx`  | two sibling layers                                   | same two layers wrapped in `<div aria-hidden="true" className="absolute inset-0 overflow-hidden">…</div>` |
| `header-desktop.tsx`   | wordmark `top-6` (h from width/height attrs)         | wordmark `top-[18px] h-12 w-auto`                                                                         |
| `logo.tsx`             | `xl:top-10 xl:left-8 xl:size-36`                     | `xl:top-4 xl:left-8 xl:size-24 xl:shadow-zine-ink`                                                        |

Rationale, in case a step looks optional: the container must stop clipping at `xl` because the Task 2 drawers render inline and must overhang the bar; the backdrop wrapper takes over clipping the `header-bg-pulse` 1.02 scale-up and the sparkle overlay; below `xl` everything keeps today's clipping and shadow (mobile pixel-identical).

- [ ] **Step 1: Update the six spec files with failing geometry assertions**

Add/adjust assertions (each spec already renders its component; extend the existing render-based tests — follow each file's current style). The required assertions:

`header.spec.tsx` — container is full-bleed:

```tsx
it('renders the container full-bleed (no xl content cap on the shell)', () => {
  const { container } = render(<Header />);
  const shell = container.firstElementChild;
  expect(shell?.className).not.toContain('xl:max-w-7xl');
  expect(shell?.className).toContain('w-full');
});
```

`header-container.spec.tsx`:

```tsx
it('drops the glow shadow and clipping at xl', () => {
  const { container } = render(<HeaderContainer>child</HeaderContainer>);
  const el = container.firstElementChild;
  expect(el?.className).toContain('xl:shadow-none');
  expect(el?.className).toContain('xl:overflow-visible');
});
```

`header-content.spec.tsx`:

```tsx
it('caps content at 7xl with the 128px xl bar', () => {
  render(<HeaderContent />);
  const header = screen.getByRole('banner');
  expect(header.className).toContain('xl:h-32');
  expect(header.className).toContain('xl:max-w-7xl');
  expect(header.className).toContain('xl:overflow-visible');
  expect(header.className).not.toContain('xl:h-56');
  expect(header.className).not.toContain('xl:max-w-480');
});
```

`header-backdrop.spec.tsx`:

```tsx
it('clips its animated layers inside its own wrapper', () => {
  const { container } = render(<HeaderBackdrop />);
  const wrapper = container.firstElementChild;
  expect(wrapper?.className).toContain('overflow-hidden');
  expect(wrapper?.getAttribute('aria-hidden')).toBe('true');
});
```

`header-desktop.spec.tsx` — wordmark geometry:

```tsx
it('renders the wordmark at 48px, centered 18px from the top', () => {
  render(<HeaderDesktop />);
  const wordmark = screen.getByAltText('Fake Four Inc. Words');
  expect(wordmark.className).toContain('top-[18px]');
  expect(wordmark.className).toContain('h-12');
});
```

`logo.spec.tsx`:

```tsx
it('renders the desktop logo as a 96px centered sticker', () => {
  render(<Logo isMobile={false} />);
  const img = screen.getByAltText('Fake Four Inc. Hand Logo');
  expect(img.className).toContain('xl:size-24');
  expect(img.className).toContain('xl:top-4');
  expect(img.className).toContain('xl:shadow-zine-ink');
  expect(img.className).not.toContain('xl:size-36');
});
```

- [ ] **Step 2: Run the six specs to verify the new assertions fail**

Run: `pnpm exec vitest run src/app/components/header/`
Expected: FAIL on exactly the new assertions (old classes still present).

- [ ] **Step 3: Apply the class changes**

Apply the table above literally. Full new bodies for the two files with structural edits:

`header-backdrop.tsx` return value becomes:

```tsx
return (
  <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
    {/* Animated background layer — mobile particles below `xl`, the desktop
        starfield tile at `xl`. Driven by viewport width (CSS), not the
        server's User-Agent guess. */}
    <div className="header-bg-pulse absolute inset-0 bg-black before:pointer-events-none before:absolute before:inset-0 before:bg-[url('/media/particles-6.svg')] before:bg-cover before:bg-center before:bg-no-repeat before:content-[''] xl:bg-transparent xl:before:bg-[url(/media/ffinc-starfield-tile.png)] xl:before:bg-auto xl:before:bg-repeat" />
    {/* Sparkle overlay */}
    <div className="pointer-events-none absolute inset-0 z-10">
      {/* …sparkles/extinguish maps unchanged… */}
    </div>
  </div>
);
```

`header-content.tsx` `<header>` className becomes (one string, keep the explanatory comment above it and update its height figures to `58px → 122px → 128px`):

```
relative z-20 mx-auto flex h-14.5 w-full min-w-0 items-center justify-between overflow-hidden border-b pb-1 pl-0 leading-14.5 md:h-30.5 xl:h-32 xl:max-w-7xl xl:justify-start xl:overflow-visible
```

`logo.tsx` `<Image>` className becomes:

```
mt-px ml-3 block size-10 rounded-full bg-zinc-50 xl:absolute xl:top-4 xl:left-8 xl:size-24 xl:shadow-zine-ink
```

`header-desktop.tsx` wordmark `<Image>` className becomes:

```
absolute top-[18px] left-1/2 z-40 h-12 w-auto -translate-x-1/2 transform
```

`header-container.tsx` container className becomes:

```
sticky top-0 right-0 left-0 z-40 w-full overflow-hidden xl:overflow-visible shadow-[0_0_30px_0_rgba(0,0,0,1)] xl:shadow-none xl:border-b-2 xl:border-b-zinc-50
```

`header.tsx`: drop the className prop from `<HeaderContainer>`.

- [ ] **Step 4: Run the header suite to verify it passes**

Run: `pnpm exec vitest run src/app/components/header/`
Expected: PASS. If pre-existing tests assert the removed classes (`xl:h-56`, `xl:max-w-480`, `xl:size-36`, shadow), update those assertions to the new values — do not keep both.

- [ ] **Step 5: Sweep for stale references to the old header height**

Run: `rg -n 'h-56|max-w-480|size-36|top-32|0_0_30px' src/ --glob '!*.spec.*'`
Expected: no hits left in header files; judge any other hits individually (unrelated `top-32`/`h-56` usages elsewhere stay).

- [ ] **Step 6: Gate and commit**

```bash
pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
git add src/app/components/header/
git commit -m "feat: ✨ full-bleed 128px desktop masthead"
```

---

### Task 5: Footer — starfield, mirrored border, 1280px content

**Files:**

- Modify: `src/app/components/footer/footer.tsx`
- Test: `src/app/components/footer/footer.spec.tsx`

**Interfaces:** none new — class changes only.

- [ ] **Step 1: Add failing assertions to `footer.spec.tsx`**

```tsx
it('matches the header at xl: starfield, top border, 7xl content', () => {
  render(<Footer />);
  const footer = screen.getByRole('contentinfo');
  expect(footer.className).toContain("xl:bg-[url('/media/ffinc-starfield-tile.png')]");
  expect(footer.className).toContain('xl:bg-repeat');
  expect(footer.className).toContain('xl:border-t-2');
  expect(footer.className).toContain('xl:border-t-zinc-50');
  const content = footer.firstElementChild;
  expect(content?.className).toContain('xl:max-w-7xl');
  expect(content?.className).not.toContain('max-w-480');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/app/components/footer/footer.spec.tsx`
Expected: FAIL on the new assertions.

- [ ] **Step 3: Apply the class changes**

`<footer>` className becomes:

```
relative min-h-23 w-full bg-zinc-950 bg-[url('/media/particles-6.svg')] bg-cover bg-center bg-no-repeat xl:border-t-2 xl:border-t-zinc-50 xl:bg-black xl:bg-[url('/media/ffinc-starfield-tile.png')] xl:bg-auto xl:bg-repeat before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:opacity-90 before:content-['']
```

Content div className becomes:

```
relative z-10 mx-auto mt-2 w-full py-1 xl:max-w-7xl
```

(Behavior below `xl` is identical: the old `max-w-480` cap never binds under a 1280px viewport.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/app/components/footer/footer.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Gate and commit**

```bash
pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
git add src/app/components/footer/
git commit -m "feat: ✨ match footer to full-bleed masthead"
```

---

### Task 6: Kraft gutters + torn page edges

**Files:**

- Modify: `src/app/globals.css` (two new utilities)
- Modify: `src/app/layout.tsx` (apply them)
- Test: `src/app/layout.spec.tsx` (class assertions)

**Interfaces:** two CSS utilities other code may reference later: `zine-desk`, `zine-page-edges`.

- [ ] **Step 1: Add failing assertions to `layout.spec.tsx`**

Follow the file's existing render approach for RootLayout; add:

```tsx
it('paints the kraft desk on body and the torn sheet on main at xl', () => {
  // however the file renders RootLayout today, reuse it, then:
  expect(document.body.className).toContain('xl:zine-desk');
  const main = document.querySelector('main');
  expect(main?.className).toContain('xl:zine-page-edges');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/app/layout.spec.tsx`
Expected: FAIL (classes absent).

- [ ] **Step 3: Add the utilities to `globals.css`**

Append after the `mobile-nav-backdrop` utility block:

```css
/* Desktop-only zine frame — the kraft "desk" the white page sits on, plus the
   torn-out sheet edges. Pure CSS/SVG data-URIs: no image requests, no JS.
   Applied with the `xl:` variant in layout.tsx; below 1280px viewports the
   gutters have zero width, so neither utility is ever visible there. */
@utility zine-desk {
  background-color: #d7ccb4;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.09'/%3E%3C/svg%3E");
}

/* The 1280px content column as a torn-out white sheet: kraft-toned tear teeth
   tile down both inside edges (14px wide, 140px period, mirrored). Painted as
   background layers inside main's box so nothing escapes overflow-x-clip. The
   tooth fill must match zine-desk's background-color. */
@utility zine-page-edges {
  background-color: var(--color-background);
  background-image:
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='140'%3E%3Cpath d='M0 0h6l4 7-6 11 7 12-5 10 8 13-6 11 5 12-7 10 8 12-5 11 6 12-7 9-2 10H0Z' fill='%23d7ccb4'/%3E%3C/svg%3E"),
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='140'%3E%3Cg transform='translate(14 0) scale(-1 1)'%3E%3Cpath d='M0 0h6l4 7-6 11 7 12-5 10 8 13-6 11 5 12-7 10 8 12-5 11 6 12-7 9-2 10H0Z' fill='%23d7ccb4'/%3E%3C/g%3E%3C/svg%3E");
  background-repeat: repeat-y, repeat-y;
  background-position:
    left top,
    right top;
  background-size:
    14px 140px,
    14px 140px;
}
```

- [ ] **Step 4: Apply in `layout.tsx`**

Body className: append `xl:zine-desk` →

```
${jost.className} flex min-h-screen max-w-full flex-col overflow-x-clip antialiased xl:zine-desk
```

Main className: append `xl:zine-page-edges` →

```
mx-auto flex w-full grow flex-col overflow-x-clip outline-none xl:max-w-7xl xl:zine-page-edges
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run src/app/layout.spec.tsx`
Expected: PASS.

- [ ] **Step 6: Gate and commit**

```bash
pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
git add src/app/globals.css src/app/layout.tsx src/app/layout.spec.tsx
git commit -m "feat: ✨ kraft gutters with torn page edges"
```

---

### Task 7: Visual verification + spacing pass (interactive checkpoint)

**Files:**

- Possibly modify: spacing utilities in `src/app/components/home-content.tsx` / `banner-strip.tsx` margins (only if screenshots show a problem)

This task validates the composition in a real browser and is the checkpoint where spacing judgments happen — the spec forbids silently deciding contentious spacing.

- [ ] **Step 1: Start the dev server** — `pnpm run dev` (normal dev env; this is NOT E2E, no DB isolation concerns beyond never touching `.env*`).
- [ ] **Step 2: Screenshot at 1280, 1440, and 1920 widths** (signed out): home, `/releases`, one drawer open (Music), one admin page. Use the browser MCP tools (`resize_page` + `take_screenshot`).
- [ ] **Step 3: Verify against the spec checklist:** bar 128px; logo 96px with 16px above/below and no overlap with "Home" (hard constraint); wordmark 18/18; drawers overhang the bar un-clipped, tape chip visible; footer starfield + borders mirror the header; kraft + torn edges visible at 1440/1920, absent below 1280; ticker gap below header looks intentional (16–24px); no horizontal scrollbar at any width.
- [ ] **Step 4: Fix only mechanical defects** (clipping, overlap, z-order) inline; **surface aesthetic calls** (ticker gap size, drawer tilt feel, kraft tone within the warm family) back to the product owner with screenshots before changing them.
- [ ] **Step 5: Gate and commit any fixes**

```bash
pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
git add -A src/
git commit -m "fix: 🐛 desktop frame spacing/clipping fixes"
```

(Skip the commit if nothing changed.)

---

### Task 8: E2E — drawer-aware nav helper + migrations

**Files:**

- Create: `e2e/helpers/desktop-nav.ts`
- Modify: `e2e/tests/placeholder-pages.spec.ts` (nav clicks at lines ~22, ~38, ~53)
- Modify: `e2e/tests/header/desktop-header.spec.ts` (Playlists visibility ~line 23; My Collection assertions stay)
- Modify: any other spec surfaced by the discovery grep below

**Interfaces:**

- Produces: `openDesktopNavLink(page: Page, name: string): Promise<void>` — clicks a top-level link directly, or opens the owning drawer first for drawered destinations.

- [ ] **Step 1: Discover every nav-click call site**

Run: `rg -n "getByRole\('banner'\).getByRole\('link'" e2e --glob '*.ts'`
Every hit whose link name is one of Releases/Artists/Playlists/Videos/Tours/Merch/About must migrate to the helper; Home/Contact Us/My Collection hits stay direct.

- [ ] **Step 2: Write the helper**

`e2e/helpers/desktop-nav.ts` (MPL header on top):

```ts
import type { Page } from '@playwright/test';

/** Which drawer owns each drawered destination (spec: Music ▾ / Label ▾). */
const DRAWER_BY_LINK = new Map<string, string>([
  ['Releases', 'Music'],
  ['Artists', 'Music'],
  ['Playlists', 'Music'],
  ['Videos', 'Music'],
  ['Tours', 'Label'],
  ['Merch', 'Label'],
  ['About', 'Label'],
]);

/**
 * Navigate via the desktop header nav. Drawered destinations need their
 * drawer opened first — click (not hover) for determinism; Radix toggles on
 * click and needs no delay handling.
 */
export const openDesktopNavLink = async (page: Page, name: string): Promise<void> => {
  const banner = page.getByRole('banner');
  const drawer = DRAWER_BY_LINK.get(name);
  if (drawer) {
    await banner.getByRole('button', { name: drawer }).click();
  }
  await banner.getByRole('link', { name }).click();
};
```

- [ ] **Step 3: Migrate the call sites**

Example — `placeholder-pages.spec.ts` "header nav reaches the Videos placeholder":

```ts
// before
const navLink = page.getByRole('banner').getByRole('link', { name: 'Videos' });
await navLink.click();
// after
await openDesktopNavLink(page, 'Videos');
```

For pure _visibility_ assertions on drawered links (e.g. `desktop-header.spec.ts` Playlists), assert the trigger instead, or open the drawer first:

```ts
await page.getByRole('banner').getByRole('button', { name: 'Music' }).click();
await expect(page.getByRole('banner').getByRole('link', { name: 'Playlists' })).toBeVisible();
```

- [ ] **Step 4: Run the E2E suite against the isolated stack**

```bash
pnpm run e2e:docker:up
pnpm run test:e2e
```

Expected: full suite green. Unexpected empty-data failures → wrong-database first hypothesis: stop and check the server's `DATABASE_URL` points at `localhost:27018` before retrying (AGENTS.md hard constraint).

- [ ] **Step 5: Gate and commit**

```bash
pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
git add e2e/
git commit -m "test: ✅ drawer-aware desktop nav e2e helper"
```

---

### Task 9: Final gate, coverage, handoff

- [ ] **Step 1: Full gate + coverage regression check**

```bash
pnpm run typecheck && pnpm run lint && pnpm run format && pnpm run test:coverage:check
```

Expected: all green; coverage within 2% of the `COVERAGE_METRICS.md` baseline. New components/hook should be near-fully covered by Tasks 1–3 specs; if branches dip, add the missing case to the owning spec file (no threshold edits).

- [ ] **Step 2: Re-run E2E once more after any coverage-driven changes** (`pnpm run test:e2e`) if Step 1 touched source.

- [ ] **Step 3: Handoff** — implementation complete on `feat/desktop-zine-frame`; use superpowers:finishing-a-development-branch (PR to `main`; never merge locally).
