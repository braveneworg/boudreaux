/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { NavMenuGroup } from '@/hooks/use-nav-menu-groups';
import { NavigationMenu, NavigationMenuList } from '@/ui/navigation-menu';

import { DesktopMenuDrawer } from './desktop-menu-drawer';

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
  items: [
    { name: 'Releases', href: '/releases', color: 'c1' },
    { name: 'Artists', href: '/artists', color: 'c2' },
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

  it('positions the drawer below the trigger, never over it', async () => {
    const user = userEvent.setup();
    const { container } = renderDrawer();

    await user.click(screen.getByRole('button', { name: /music/i }));
    await screen.findByRole('link', { name: 'Releases' });

    // shadcn's own `top-full`/`mt-1.5` are gated behind the
    // `group/navigation-menu` marker the Root omits, so without these tokens
    // the panel inherits base `top-0` and covers its trigger.
    const content = container.querySelector('[data-slot="navigation-menu-content"]');
    const tokens = (content?.className ?? '').split(/\s+/);
    expect(tokens).toContain('top-full');
    expect(tokens).toContain('mt-3');
  });

  it('marks the active child with aria-current=page', async () => {
    const user = userEvent.setup();
    renderDrawer('/releases/some-release');

    await user.click(screen.getByRole('button', { name: /music/i }));

    const releases = await screen.findByRole('link', { name: 'Releases' });
    expect(releases).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Artists' })).not.toHaveAttribute('aria-current');
  });

  it('underlines the trigger in the group color when a child route is active (active trail)', () => {
    renderDrawer('/artists/123');

    // Token-level check — a substring match would false-positive on
    // `underline-offset-8`. The active trail carries the group color so the
    // label and its underline match (underline follows currentColor).
    const tokens = screen.getByRole('button', { name: /music/i }).className.split(/\s+/);
    expect(tokens).toContain('underline');
    expect(tokens).toContain('text-menu-item-cyan-400');
  });

  it('does not underline the trigger on unrelated routes', () => {
    renderDrawer('/tours');

    const tokens = screen.getByRole('button', { name: /music/i }).className.split(/\s+/);
    expect(tokens).not.toContain('underline');
  });

  it('opens on Enter and closes on Escape from the keyboard', async () => {
    const user = userEvent.setup();
    renderDrawer();

    const trigger = screen.getByRole('button', { name: /music/i });
    trigger.focus();
    await user.keyboard('{Enter}');

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByRole('link', { name: 'Releases' })).toBeVisible();

    await user.keyboard('{Escape}');

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps the trigger legible on the black masthead when open and focused', () => {
    renderDrawer();

    // shadcn's trigger cva ships `data-[state=open]:text-accent-foreground` and
    // `focus:text-accent-foreground` (near-black); without competing tokens
    // tailwind-merge keeps them and open/focused labels go dark on the black
    // starfield. Open and focus both wear the group color — light and legible,
    // and both must survive the cn() merge over the cva defaults.
    const tokens = screen.getByRole('button', { name: /music/i }).className.split(/\s+/);
    expect(tokens).toContain('data-[state=open]:text-menu-item-cyan-400');
    expect(tokens).toContain('focus:text-menu-item-cyan-400');
    expect(tokens).not.toContain('data-[state=open]:text-accent-foreground');
    expect(tokens).not.toContain('focus:text-accent-foreground');
    expect(tokens).not.toContain('data-[state=open]:text-zinc-50');
  });

  it('colors the label to match its underline on hover, focus, and while open', () => {
    renderDrawer();

    // Hover, focus, and open all color the label; the underline follows
    // currentColor, so label and underline share the group color. A plain
    // `focus:text-zinc-50` white override would snap a clicked/tabbed trigger
    // back to white, so it must be absent.
    const tokens = screen.getByRole('button', { name: /music/i }).className.split(/\s+/);
    expect(tokens).toContain('hover:text-menu-item-cyan-400');
    expect(tokens).toContain('focus:text-menu-item-cyan-400');
    expect(tokens).toContain('hover:underline');
    expect(tokens).toContain('data-[state=open]:text-menu-item-cyan-400');
    expect(tokens).toContain('data-[state=open]:underline');
    expect(tokens).not.toContain('focus:text-zinc-50');
  });
});
