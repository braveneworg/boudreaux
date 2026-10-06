/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  composeArtistLinks,
  isRenderableArtistLinkHref,
  normalizeArtistLinks,
  sanitizeArtistLinks,
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
      contact: [{ heading: 'Booking', links: [{ label: 'Agent', url: 'agent@example.com' }] }],
    });
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
        contact: [{ heading: 'Press', links: [{ label: null, url: 'mailto:press@example.com' }] }],
      })
    ).toEqual({
      websiteLinks: [{ label: '', url: 'https://example.com' }],
      socialLinks: [{ label: 'IG', url: 'https://www.instagram.com/x' }],
      contactLinkGroups: [
        { heading: 'Press', links: [{ label: '', url: 'mailto:press@example.com' }] },
      ],
    });
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
