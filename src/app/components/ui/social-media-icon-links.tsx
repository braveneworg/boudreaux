/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ComponentType } from 'react';

import Link from 'next/link';

import { cn } from '@/lib/utils/tailwind-utils';

import {
  BandcampIcon,
  FacebookIcon,
  InstagramIcon,
  SpotifyIcon,
  TikTokIcon,
  XIcon,
  YouTubeIcon,
} from './social-media-icons';

interface MenuLink {
  href: string;
  Icon: ComponentType<{ className?: string; size?: number }>;
  label: string;
}

const menuLinks: MenuLink[] = [
  {
    href: 'https://facebook.com/fakefourinc',
    Icon: FacebookIcon,
    label: 'Facebook',
  },
  {
    href: 'https://instagram.com/fakefourinc',
    Icon: InstagramIcon,
    label: 'Instagram',
  },
  {
    href: 'https://YouTube.com/fakefourinc',
    Icon: YouTubeIcon,
    label: 'YouTube',
  },
  {
    href: 'https://fakefour.bandcamp.com',
    Icon: BandcampIcon,
    label: 'Bandcamp',
  },
  {
    href: 'https://x.com/fakefour',
    Icon: XIcon,
    label: 'X',
  },
  {
    href: 'https://tiktok.com/@fakefourinc',
    Icon: TikTokIcon,
    label: 'TikTok',
  },
  {
    href: 'https://open.spotify.com/user/fakefourinc',
    Icon: SpotifyIcon,
    label: 'Spotify',
  },
];

const SocialMediaIconLinks = ({ className }: { className: string }) => (
  <div className={cn(['flex flex-wrap pt-0 justify-end', className])}>
    {menuLinks.map((link) => (
      <Link
        aria-label={link.label}
        className="text-zinc-50 w-10 h-10 px-2 transition-transform md:hover:scale-[107.5%]"
        data-testid={`${link.label.toLowerCase()}-icon`}
        href={link.href}
        key={link.href}
        rel="noopener"
        target="_blank"
        title={link.label}
      >
        <link.Icon size={24} />
        <span className="sr-only">{link.label}</span>
      </Link>
    ))}
  </div>
);

export default SocialMediaIconLinks;
