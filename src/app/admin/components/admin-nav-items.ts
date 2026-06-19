/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Bell, CalendarDays, Disc, MessageSquare, ScrollText, Star, Users } from 'lucide-react';

import type { LucideIcon } from 'lucide-react';

export interface AdminNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Short guidance surfaced in the section header help popover. */
  help: string;
}

/**
 * Admin sections in importance order (left to right). Releases lead; ops and
 * utility surfaces trail. Shared by the persistent nav, the dashboard tiles,
 * and tests so the order stays in lockstep.
 */
export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  {
    label: 'Releases',
    href: '/admin/releases',
    icon: Disc,
    help: 'Create, publish, and manage music releases and their digital formats.',
  },
  {
    label: 'Featured Artists',
    href: '/admin/featured-artists',
    icon: Star,
    help: 'Curate the artists and tracks spotlighted on the public site.',
  },
  {
    label: 'Artists',
    href: '/admin/artists',
    icon: Users,
    help: 'Update and manage the artist roster. New artists are added from a release.',
  },
  {
    label: 'Notifications',
    href: '/admin/notifications',
    icon: Bell,
    help: 'Manage site-wide banner notifications and their rotation interval.',
  },
  {
    label: 'Chat',
    href: '/admin/chat',
    icon: MessageSquare,
    help: 'Moderate chat: review flagged users, hide messages, and disable access.',
  },
  {
    label: 'Tours',
    href: '/admin/tours',
    icon: CalendarDays,
    help: 'Manage tours, tour dates, venues, and the artists on each date.',
  },
  {
    label: 'Logging',
    href: '/admin/logging',
    icon: ScrollText,
    help: 'Temporarily change the runtime log level for diagnostics.',
  },
] as const;
