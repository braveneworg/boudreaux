/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { normalizeArtistLinks, sanitizeArtistLinks } from './sanitize-artist-links';

vi.mock('server-only', () => ({}));

describe('normalizeArtistLinks', () => {
  it('trims, sanitises labels and headings, normalises contact hrefs and drops empty groups', () => {
    expect(
      normalizeArtistLinks({
        websiteLinks: [{ label: ' <b>Site</b> ', url: ' https://example.com ' }],
        socialLinks: [{ label: '', url: 'https://www.instagram.com/x' }],
        contactLinkGroups: [
          { heading: ' Booking ', links: [{ label: 'Agent', url: 'agent@example.com' }] },
          { heading: 'Merch', links: [] },
        ],
      })
    ).toEqual({
      websites: [{ label: 'Site', url: 'https://example.com' }],
      social: [{ label: null, url: 'https://www.instagram.com/x' }],
      contact: [
        { heading: 'Booking', links: [{ label: 'Agent', url: 'mailto:agent@example.com' }] },
      ],
    });
  });

  it('keeps the order the admin arranged', () => {
    const normalized = normalizeArtistLinks({
      websiteLinks: [
        { label: '', url: 'https://b.example.com' },
        { label: '', url: 'https://a.example.com' },
      ],
      socialLinks: [],
      contactLinkGroups: [],
    });

    expect(normalized?.websites.map(({ url }) => url)).toEqual([
      'https://b.example.com',
      'https://a.example.com',
    ]);
  });

  it('is null when every section is empty, so the artist stores no composite', () => {
    expect(
      normalizeArtistLinks({
        websiteLinks: [],
        socialLinks: [],
        contactLinkGroups: [{ heading: 'Booking', links: [] }],
      })
    ).toBeNull();
  });
});

describe('sanitizeArtistLinks', () => {
  it('is what the service applies to any stored shape it is handed', () => {
    expect(
      sanitizeArtistLinks({
        websites: [{ label: '<b>Site</b>', url: ' https://example.com ' }],
        social: [],
        contact: [
          { heading: ' Booking ', links: [{ label: null, url: 'agent@example.com' }] },
          { heading: 'Merch', links: [] },
        ],
      })
    ).toEqual({
      websites: [{ label: 'Site', url: 'https://example.com' }],
      social: [],
      contact: [{ heading: 'Booking', links: [{ label: null, url: 'mailto:agent@example.com' }] }],
    });
  });

  it('leaves an already sanitised composite unchanged', () => {
    const links = {
      websites: [{ label: 'Site', url: 'https://example.com' }],
      social: [{ label: null, url: 'https://www.instagram.com/x' }],
      contact: [{ heading: 'Booking', links: [{ label: null, url: 'tel:+18605550134' }] }],
    };

    expect(sanitizeArtistLinks(links)).toEqual(links);
  });

  it('is null when nothing is left', () => {
    expect(sanitizeArtistLinks({ websites: [], social: [], contact: [] })).toBeNull();
  });
});
