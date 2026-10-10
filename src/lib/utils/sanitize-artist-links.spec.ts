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
        {
          heading: 'Booking',
          links: [{ label: 'Agent', description: null, url: 'mailto:agent@example.com' }],
        },
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
          {
            heading: ' Booking ',
            links: [{ label: null, description: null, url: 'agent@example.com' }],
          },
          { heading: 'Merch', links: [] },
        ],
      })
    ).toEqual({
      websites: [{ label: 'Site', url: 'https://example.com' }],
      social: [],
      contact: [
        {
          heading: 'Booking',
          links: [{ label: null, description: null, url: 'mailto:agent@example.com' }],
        },
      ],
    });
  });

  it('stores a contact description as plain text, trimmed', () => {
    const sanitized = sanitizeArtistLinks({
      websites: [],
      social: [],
      contact: [
        {
          heading: 'Booking',
          links: [
            {
              label: 'Agent',
              description: '  <b>Books</b> US &amp; EU tours  ',
              url: 'mailto:agent@example.com',
            },
          ],
        },
      ],
    });

    expect(sanitized?.contact[0].links[0].description).toBe('Books US & EU tours');
  });

  it.each(['   ', '<b></b>', '<script>alert(1)</script>'])(
    'stores a description with no text left as null: %s',
    (description) => {
      const sanitized = sanitizeArtistLinks({
        websites: [],
        social: [],
        contact: [
          {
            heading: 'Booking',
            links: [{ label: 'Agent', description, url: 'mailto:agent@example.com' }],
          },
        ],
      });

      expect(sanitized?.contact[0].links[0].description).toBeNull();
    }
  );

  it('leaves an already sanitised composite unchanged', () => {
    const links = {
      websites: [{ label: 'Site', url: 'https://example.com' }],
      social: [{ label: null, url: 'https://www.instagram.com/x' }],
      contact: [
        {
          heading: 'Booking',
          links: [
            { label: 'Agent', description: 'Books US & EU tours', url: 'mailto:a@example.com' },
            { label: null, description: null, url: 'tel:+18605550134' },
          ],
        },
      ],
    };

    expect(sanitizeArtistLinks(links)).toEqual(links);
  });

  // Only a Contact & Misc link has a description (ADR-0020 amendment).
  it('gives a website or social link no description key', () => {
    const sanitized = sanitizeArtistLinks({
      websites: [{ label: 'Site', url: 'https://example.com' }],
      social: [{ label: null, url: 'https://www.instagram.com/x' }],
      contact: [],
    });

    expect(
      [...(sanitized?.websites ?? []), ...(sanitized?.social ?? [])].map((link) =>
        Object.keys(link)
      )
    ).toEqual([
      ['label', 'url'],
      ['label', 'url'],
    ]);
  });

  it('is null when nothing is left', () => {
    expect(sanitizeArtistLinks({ websites: [], social: [], contact: [] })).toBeNull();
  });
});
