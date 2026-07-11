/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { NavMenuGroup } from '@/hooks/use-nav-menu-groups';

import { MobileMenuGroup } from './mobile-menu-group';

// Mock next/link to surface the prefetch posture as data attributes (Link
// behavior, not DOM attributes — the real component hides them). Event props
// (onClick) still spread onto the anchor so navigation tests keep working.
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

const musicGroup: NavMenuGroup = {
  label: 'Music',
  items: [
    {
      name: 'Releases',
      href: '/releases',
      color: 'aria-[current=page]:text-menu-item-cyan-400 hover:text-menu-item-cyan-400',
    },
    {
      name: 'Artists',
      href: '/artists',
      color: 'aria-[current=page]:text-menu-item-pink-300 hover:text-menu-item-pink-300',
    },
  ],
};

const labelGroup: NavMenuGroup = {
  label: 'Label',
  items: [
    {
      name: 'Tours',
      href: '/tours',
      color: 'aria-[current=page]:text-menu-item-tan-200 hover:text-menu-item-tan-200',
    },
  ],
};

interface RenderGroupOptions {
  group?: NavMenuGroup;
  index?: number;
  pathname?: string;
  onNavigate?: () => void;
  /** Pre-expands the group when set (mirrors MobileMenu's auto-open). */
  defaultValue?: string;
}

const renderGroup = ({
  group = musicGroup,
  index = 1,
  pathname = '/',
  onNavigate = vi.fn(),
  defaultValue,
}: RenderGroupOptions = {}) =>
  render(
    <AccordionPrimitive.Root asChild type="single" collapsible defaultValue={defaultValue}>
      <ul>
        <MobileMenuGroup group={group} index={index} pathname={pathname} onNavigate={onNavigate} />
      </ul>
    </AccordionPrimitive.Root>
  );

describe('MobileMenuGroup', () => {
  beforeEach(() => {
    // Prevent jsdom "Not implemented: navigation" errors from anchor clicks.
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'A' || target.closest('a')) {
        e.preventDefault();
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  });

  it('renders the trigger as a collapsed disclosure button', () => {
    renderGroup();

    expect(screen.getByRole('button', { name: 'Music' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps child links out of the DOM while collapsed', () => {
    renderGroup();

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('expands on click and reveals the child links', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    renderGroup();

    await user.click(screen.getByRole('button', { name: 'Music' }));

    expect(screen.getByRole('button', { name: 'Music' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Releases' })).toHaveAttribute('href', '/releases');
    expect(screen.getByRole('link', { name: 'Artists' })).toHaveAttribute('href', '/artists');
  });

  it('renders a rotating chevron indicator on the trigger', () => {
    renderGroup();

    const trigger = screen.getByRole('button', { name: 'Music' });
    const chevron = trigger.querySelector('svg');
    expect(chevron).toHaveAttribute('aria-hidden', 'true');
    expect(chevron).toHaveClass('transition-transform');
    expect(trigger).toHaveClass('[&[data-state=open]>svg]:rotate-180');
  });

  it('wears the Music cyan only in the open state', () => {
    renderGroup();

    const trigger = screen.getByRole('button', { name: 'Music' });
    expect(trigger).toHaveClass('data-[state=open]:text-menu-item-cyan-400');
    expect(trigger).toHaveClass('data-[state=open]:underline');
    expect(trigger).toHaveClass('text-zinc-50');
  });

  it('wears the Label pink only in the open state', () => {
    renderGroup({ group: labelGroup });

    const trigger = screen.getByRole('button', { name: 'Label' });
    expect(trigger).toHaveClass('data-[state=open]:text-menu-item-pink-400');
    expect(trigger).toHaveClass('data-[state=open]:underline');
  });

  it('adopts the group color while a child route is active (trail)', () => {
    renderGroup({ pathname: '/releases' });

    const trigger = screen.getByRole('button', { name: 'Music' });
    expect(trigger).toHaveClass('text-menu-item-cyan-400');
    expect(trigger).toHaveClass('underline');
  });

  it('stays white with no trail when no child route is active', () => {
    renderGroup({ pathname: '/tours' });

    const trigger = screen.getByRole('button', { name: 'Music' });
    expect(trigger).not.toHaveClass('text-menu-item-cyan-400');
    expect(trigger).not.toHaveClass('underline');
    expect(trigger).toHaveClass('text-zinc-50');
  });

  it('renders children smaller than the parents in the cutout font', () => {
    renderGroup({ defaultValue: 'Music' });

    const link = screen.getByRole('link', { name: 'Releases' });
    expect(link).toHaveClass('text-lg');
    expect(link).toHaveClass('text-zinc-50');
  });

  it('applies each child item color on top of the white base', () => {
    renderGroup({ defaultValue: 'Music' });

    const link = screen.getByRole('link', { name: 'Artists' });
    expect(link).toHaveClass('aria-[current=page]:text-menu-item-pink-300');
    expect(link).toHaveClass('text-zinc-50');
  });

  it('marks the active child link with aria-current=page', () => {
    renderGroup({ pathname: '/releases', defaultValue: 'Music' });

    expect(screen.getByRole('link', { name: 'Releases' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Artists' })).not.toHaveAttribute('aria-current');
  });

  it('upgrades child links to a full prefetch on touch intent', () => {
    renderGroup({ defaultValue: 'Music' });

    screen.getAllByRole('link').forEach((link) => {
      expect(link).toHaveAttribute('data-prefetch', 'default');
      expect(link).toHaveAttribute('data-dynamic-on-hover', 'true');
    });
  });

  it('draws the Music panel spine in the trigger cyan', () => {
    renderGroup({ defaultValue: 'Music' });

    const spine = screen.getByRole('link', { name: 'Releases' }).closest('ul');
    expect(spine).toHaveClass('border-l-2');
    expect(spine).toHaveClass('border-menu-item-cyan-400');
  });

  it('draws the Label panel spine in the trigger pink', () => {
    renderGroup({ group: labelGroup, defaultValue: 'Label' });

    const spine = screen.getByRole('link', { name: 'Tours' }).closest('ul');
    expect(spine).toHaveClass('border-menu-item-pink-400');
  });

  it('paints the expanded panel on a solid zinc-950 ground', () => {
    renderGroup({ defaultValue: 'Music' });

    const panel = screen.getByRole('link', { name: 'Releases' }).closest('ul')?.parentElement;
    expect(panel).toHaveClass('bg-zinc-950');
  });

  it('calls onNavigate when a child link is clicked', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    renderGroup({ defaultValue: 'Music', onNavigate });

    await user.click(screen.getByRole('link', { name: 'Releases' }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('staggers the entry via its index slot', () => {
    renderGroup({ index: 2 });

    const entry = screen.getByRole('button', { name: 'Music' }).closest('li');
    expect(entry).toHaveClass('menu-item-stagger');
    expect(entry).toHaveClass('font-fake-four-cutout');
    expect(entry).toHaveStyle({ animationDelay: '0.2s' });
  });

  it('does not stagger the child items', () => {
    renderGroup({ defaultValue: 'Music' });

    const childItem = screen.getByRole('link', { name: 'Releases' }).closest('li');
    expect(childItem).not.toHaveClass('menu-item-stagger');
  });
});
