/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render } from '@testing-library/react';

import { ArtistLinkIcon } from './artist-link-icon';

const iconOf = (href: string, section: 'websites' | 'social' | 'contact' = 'social') => {
  const { container } = render(<ArtistLinkIcon href={href} section={section} />);
  return container.querySelector('[data-icon]');
};

// ADR-0020: the icon derives from the href at render; nothing is stored.
describe('ArtistLinkIcon', () => {
  it('shows the brand icon of a recognised host', () => {
    expect(iconOf('https://www.instagram.com/x')).toHaveAttribute('data-icon', 'instagram');
  });

  it('shows the Discogs icon', () => {
    expect(iconOf('https://www.discogs.com/artist/1')).toHaveAttribute('data-icon', 'discogs');
  });

  it.each([
    ['https://soundcloud.com/x', 'soundcloud'],
    ['https://music.apple.com/us/artist/x/1', 'apple-music'],
    ['https://bsky.app/profile/x', 'bluesky'],
    ['https://www.threads.net/@x', 'threads'],
    ['https://www.patreon.com/x', 'patreon'],
  ])('shows a brand icon for %s', (href, kind) => {
    expect(iconOf(href)).toHaveAttribute('data-icon', kind);
    expect(iconOf(href)?.querySelector('svg')).not.toBeNull();
  });

  it('shows a mail icon for a mailto: contact link', () => {
    expect(iconOf('mailto:a@example.com', 'contact')).toHaveAttribute('data-icon', 'mail');
  });

  it('shows a phone icon for a tel: contact link', () => {
    expect(iconOf('tel:+18605550134', 'contact')).toHaveAttribute('data-icon', 'phone');
  });

  it('falls back to a globe for a host nobody recognises', () => {
    expect(iconOf('https://unknown-host.example.org/x')).toHaveAttribute('data-icon', 'globe');
  });

  it('falls back to a globe while the href is not a URL yet', () => {
    expect(iconOf('insta')).toHaveAttribute('data-icon', 'globe');
  });

  it('is decorative', () => {
    expect(iconOf('https://x.com/x')).toHaveAttribute('aria-hidden', 'true');
  });
});
