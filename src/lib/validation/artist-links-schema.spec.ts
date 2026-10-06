/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  MAX_ARTIST_LINK_GROUPS,
  MAX_ARTIST_LINKS_PER_SECTION,
  artistLinkGroupInputSchema,
  artistLinksFormSchema,
  artistLinksSchema,
  contactLinkInputSchema,
  httpLinkInputSchema,
} from './artist-links-schema';

describe('artistLinksSchema (stored shape)', () => {
  it('parses a composite with every section', () => {
    const links = {
      websites: [{ label: null, url: 'https://example.com' }],
      social: [],
      contact: [{ heading: 'Booking', links: [{ label: 'Agent', url: 'mailto:a@example.com' }] }],
    };

    expect(artistLinksSchema.parse(links)).toEqual(links);
  });
});

describe('httpLinkInputSchema', () => {
  it('accepts an http(s) link without a label', () => {
    expect(httpLinkInputSchema.parse({ url: 'https://example.com' })).toEqual({
      url: 'https://example.com',
    });
  });

  it('rejects a non-http scheme', () => {
    expect(httpLinkInputSchema.safeParse({ url: 'mailto:a@example.com' }).success).toBe(false);
  });

  it('rejects an empty url', () => {
    expect(httpLinkInputSchema.safeParse({ url: '  ' }).success).toBe(false);
  });
});

describe('contactLinkInputSchema', () => {
  it.each(['https://example.com', 'agent@example.com', '+1 (860) 555-0134', 'tel:8605550134'])(
    'accepts %s as typed, leaving normalisation to the service',
    (url) => {
      expect(contactLinkInputSchema.parse({ url }).url).toBe(url);
    }
  );

  it('rejects an email that could carry a header', () => {
    expect(contactLinkInputSchema.safeParse({ url: 'a@example.com?bcc=x' }).success).toBe(false);
  });

  it('rejects text that is neither a URL, an email nor a phone number', () => {
    expect(contactLinkInputSchema.safeParse({ url: 'call me' }).success).toBe(false);
  });
});

describe('artistLinkGroupInputSchema', () => {
  it('requires a heading', () => {
    expect(artistLinkGroupInputSchema.safeParse({ heading: ' ', links: [] }).success).toBe(false);
  });

  it('accepts a heading with no links yet', () => {
    expect(artistLinkGroupInputSchema.parse({ heading: 'Booking', links: [] })).toEqual({
      heading: 'Booking',
      links: [],
    });
  });
});

describe('artistLinksFormSchema', () => {
  const link = { label: '', url: 'https://example.com' };

  it('parses the three form arrays', () => {
    expect(
      artistLinksFormSchema.parse({
        websiteLinks: [link],
        socialLinks: [],
        contactLinkGroups: [{ heading: 'Booking', links: [] }],
      })
    ).toEqual({
      websiteLinks: [link],
      socialLinks: [],
      contactLinkGroups: [{ heading: 'Booking', links: [] }],
    });
  });

  // Request-size guards, not product caps (ADR-0020).
  it('refuses a section past the request-size guard', () => {
    const websiteLinks = Array.from({ length: MAX_ARTIST_LINKS_PER_SECTION + 1 }, () => link);

    expect(
      artistLinksFormSchema.safeParse({ websiteLinks, socialLinks: [], contactLinkGroups: [] })
        .success
    ).toBe(false);
  });

  it('refuses more groups than the request-size guard', () => {
    const contactLinkGroups = Array.from({ length: MAX_ARTIST_LINK_GROUPS + 1 }, () => ({
      heading: 'G',
      links: [],
    }));

    expect(
      artistLinksFormSchema.safeParse({ websiteLinks: [], socialLinks: [], contactLinkGroups })
        .success
    ).toBe(false);
  });
});
