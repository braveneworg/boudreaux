/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ComponentType } from 'react';

import { Globe, Mail, Phone } from 'lucide-react';

import type { ArtistLinkSection } from '@/lib/utils/artist-links';
import { socialPlatformFromUrl, type SocialPlatform } from '@/lib/utils/social-platform-from-url';

import {
  BandcampIcon,
  DiscogsIcon,
  FacebookIcon,
  InstagramIcon,
  SpotifyIcon,
  TikTokIcon,
  XIcon,
  YouTubeIcon,
} from './social-media-icons';

type IconComponent = ComponentType<{ className?: string; size?: number }>;

const ICONS = new Map<ArtistLinkIconKind, IconComponent>([
  ['facebook', FacebookIcon],
  ['instagram', InstagramIcon],
  ['youtube', YouTubeIcon],
  ['bandcamp', BandcampIcon],
  ['x', XIcon],
  ['tiktok', TikTokIcon],
  ['spotify', SpotifyIcon],
  ['discogs', DiscogsIcon],
  ['mail', Mail],
  ['phone', Phone],
  ['globe', Globe],
]);

/** What an artist link's icon shows: a brand, mail, phone, or the generic globe. */
export type ArtistLinkIconKind = SocialPlatform | 'mail' | 'phone' | 'globe';

/**
 * The icon kind for a link's href (ADR-0020: derived at render, nothing
 * stored). A contact `mailto:`/`tel:` gets mail/phone; a recognised host gets
 * its brand; anything else, a URL still being typed included, gets a globe.
 */
export const artistLinkIconKind = (
  href: string,
  section: ArtistLinkSection
): ArtistLinkIconKind => {
  if (section === 'contact') {
    if (/^mailto:/i.test(href)) return 'mail';
    if (/^tel:/i.test(href)) return 'phone';
  }
  return socialPlatformFromUrl(href) ?? 'globe';
};

interface ArtistLinkIconProps {
  href: string;
  section: ArtistLinkSection;
  size?: number;
  className?: string;
}

/** The decorative icon beside an artist link, chosen from its href. */
export const ArtistLinkIcon = ({
  href,
  section,
  size = 16,
  className,
}: ArtistLinkIconProps): React.ReactElement => {
  const kind = artistLinkIconKind(href, section);
  const Icon = ICONS.get(kind) ?? Globe;
  return (
    <span data-icon={kind} aria-hidden="true" className="inline-flex shrink-0">
      <Icon size={size} className={className} />
    </span>
  );
};
