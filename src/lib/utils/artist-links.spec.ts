/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  composeArtistLinks,
  isRenderableArtistLinkHref,
  toArtistLinksFormValues,
  toContactHref,
} from './artist-links';

describe('toContactHref', () => {
  it('keeps an http(s) URL, trimmed', () => {
    expect(toContactHref('  https://example.com/booking ')).toBe('https://example.com/booking');
  });

  it('turns a bare email address into a mailto: href', () => {
    expect(toContactHref('booking@example.com')).toBe('mailto:booking@example.com');
  });

  it('lowercases the mailto: scheme and keeps the address as typed', () => {
    expect(toContactHref('MAILTO:Booking@Example.com')).toBe('mailto:Booking@Example.com');
  });

  it.each(['a@b.com?subject=x', 'a@b.com#x', 'a&b@b.com', 'a%40b.com', 'a b@c.com'])(
    'rejects an email that could carry a header or is malformed: %s',
    (value) => {
      expect(toContactHref(value)).toBeNull();
    }
  );

  it('turns a phone number into a tel: href with its separators stripped', () => {
    expect(toContactHref('+1 (860) 555-0134')).toBe('tel:+18605550134');
  });

  it('normalises a tel: href the same way', () => {
    expect(toContactHref('tel:860.555.0134')).toBe('tel:8605550134');
  });

  it.each(['12345', '1234567890123456', 'tel:abc', '+'])(
    'rejects a phone outside 7–15 digits: %s',
    (value) => {
      expect(toContactHref(value)).toBeNull();
    }
  );

  it.each(['', '   ', 'javascript:alert(1)', 'ftp://example.com', 'no-at-sign', 'mailto:'])(
    'rejects anything else: %s',
    (value) => {
      expect(toContactHref(value)).toBeNull();
    }
  );
});

describe('isRenderableArtistLinkHref', () => {
  it('renders an http(s) href in every section', () => {
    expect(isRenderableArtistLinkHref('https://example.com', 'websites')).toBe(true);
    expect(isRenderableArtistLinkHref('https://example.com', 'social')).toBe(true);
    expect(isRenderableArtistLinkHref('https://example.com', 'contact')).toBe(true);
  });

  it('renders a normalised mailto: or tel: href only in the contact section', () => {
    expect(isRenderableArtistLinkHref('mailto:a@example.com', 'contact')).toBe(true);
    expect(isRenderableArtistLinkHref('tel:+18605550134', 'contact')).toBe(true);
    expect(isRenderableArtistLinkHref('mailto:a@example.com', 'websites')).toBe(false);
    expect(isRenderableArtistLinkHref('tel:+18605550134', 'social')).toBe(false);
  });

  it('refuses a stored href that no longer passes the rule', () => {
    expect(isRenderableArtistLinkHref('mailto:a@example.com?bcc=x', 'contact')).toBe(false);
    expect(isRenderableArtistLinkHref('tel:+1860', 'contact')).toBe(false);
    expect(isRenderableArtistLinkHref('javascript:alert(1)', 'websites')).toBe(false);
  });
});

describe('composeArtistLinks', () => {
  it('maps the form arrays to the stored shape as typed, empty labels as null', () => {
    expect(
      composeArtistLinks({
        websiteLinks: [{ label: '', url: ' https://example.com ' }],
        socialLinks: [],
        contactLinkGroups: [
          { heading: 'Booking', links: [{ label: 'Agent', url: 'agent@example.com' }] },
        ],
      })
    ).toEqual({
      websites: [{ label: null, url: ' https://example.com ' }],
      social: [],
      contact: [
        {
          heading: 'Booking',
          links: [{ label: 'Agent', description: null, url: 'agent@example.com' }],
        },
      ],
    });
  });

  it('keeps a typed contact description and stores an empty or missing one as null', () => {
    const { contact } = composeArtistLinks({
      websiteLinks: [],
      socialLinks: [],
      contactLinkGroups: [
        {
          heading: 'Booking',
          links: [
            { label: 'Agent', description: 'Books US tours', url: 'agent@example.com' },
            { label: 'Office', description: '', url: '+1 860 555 0134' },
            { label: '', url: 'https://example.com/booking' },
          ],
        },
      ],
    });

    expect(contact[0].links).toEqual([
      { label: 'Agent', description: 'Books US tours', url: 'agent@example.com' },
      { label: 'Office', description: null, url: '+1 860 555 0134' },
      { label: null, description: null, url: 'https://example.com/booking' },
    ]);
  });

  // Only a Contact & Misc link has a description (ADR-0020 amendment).
  it('gives a website or social link no description key', () => {
    const { websites, social } = composeArtistLinks({
      websiteLinks: [{ label: 'Site', url: 'https://example.com' }],
      socialLinks: [{ label: '', url: 'https://www.instagram.com/x' }],
      contactLinkGroups: [],
    });

    expect([...websites, ...social].map((link) => Object.keys(link))).toEqual([
      ['label', 'url'],
      ['label', 'url'],
    ]);
  });
});

describe('toArtistLinksFormValues', () => {
  it('prefills the Booking and Merch groups for an artist with no links', () => {
    expect(toArtistLinksFormValues(null)).toEqual({
      websiteLinks: [],
      socialLinks: [],
      contactLinkGroups: [
        { heading: 'Booking', links: [] },
        { heading: 'Merch', links: [] },
      ],
    });
  });

  it('maps a stored composite to the three form arrays, null labels as empty strings', () => {
    expect(
      toArtistLinksFormValues({
        websites: [{ label: null, url: 'https://example.com' }],
        social: [{ label: 'IG', url: 'https://www.instagram.com/x' }],
        contact: [
          {
            heading: 'Press',
            links: [{ label: null, description: null, url: 'mailto:press@example.com' }],
          },
        ],
      })
    ).toEqual({
      websiteLinks: [{ label: '', url: 'https://example.com' }],
      socialLinks: [{ label: 'IG', url: 'https://www.instagram.com/x' }],
      contactLinkGroups: [
        {
          heading: 'Press',
          links: [{ label: '', description: '', url: 'mailto:press@example.com' }],
        },
      ],
    });
  });

  it('keeps a stored contact description and maps a null one to an empty string', () => {
    const { contactLinkGroups } = toArtistLinksFormValues({
      websites: [],
      social: [],
      contact: [
        {
          heading: 'Booking',
          links: [
            { label: 'Agent', description: 'Books US tours', url: 'mailto:agent@example.com' },
            { label: 'Office', description: null, url: 'tel:+18605550134' },
          ],
        },
      ],
    });

    expect(contactLinkGroups[0].links).toEqual([
      { label: 'Agent', description: 'Books US tours', url: 'mailto:agent@example.com' },
      { label: 'Office', description: '', url: 'tel:+18605550134' },
    ]);
  });

  it('gives a website or social row no description key', () => {
    const { websiteLinks, socialLinks } = toArtistLinksFormValues({
      websites: [{ label: null, url: 'https://example.com' }],
      social: [{ label: 'IG', url: 'https://www.instagram.com/x' }],
      contact: [],
    });

    expect([...websiteLinks, ...socialLinks].map((link) => Object.keys(link))).toEqual([
      ['label', 'url'],
      ['label', 'url'],
    ]);
  });

  it('prefills the groups when the stored contact section is empty', () => {
    expect(
      toArtistLinksFormValues({ websites: [], social: [], contact: [] }).contactLinkGroups
    ).toEqual([
      { heading: 'Booking', links: [] },
      { heading: 'Merch', links: [] },
    ]);
  });
});
