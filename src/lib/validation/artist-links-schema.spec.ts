/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  MAX_ARTIST_LINK_DESCRIPTION_LENGTH,
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
      contact: [
        {
          heading: 'Booking',
          links: [{ label: 'Agent', description: null, url: 'mailto:a@example.com' }],
        },
      ],
    };

    expect(artistLinksSchema.parse(links)).toEqual(links);
  });

  // Zod strips a key a schema does not name, so the read schema must name it.
  it('keeps the description of a contact link, set or null', () => {
    const links = {
      websites: [],
      social: [],
      contact: [
        {
          heading: 'Booking',
          links: [
            { label: 'Agent', description: 'Books US tours', url: 'mailto:a@example.com' },
            { label: null, description: null, url: 'tel:+18605550134' },
          ],
        },
      ],
    };

    expect(artistLinksSchema.parse(links).contact[0].links).toEqual([
      { label: 'Agent', description: 'Books US tours', url: 'mailto:a@example.com' },
      { label: null, description: null, url: 'tel:+18605550134' },
    ]);
  });

  // The description belongs to Contact & Misc alone.
  it('strips a description from a website or social link', () => {
    const link = { label: null, description: 'Stray', url: 'https://example.com' };

    const { websites, social } = artistLinksSchema.parse({
      websites: [link],
      social: [link],
      contact: [],
    });

    expect([...websites, ...social]).toEqual([
      { label: null, url: 'https://example.com' },
      { label: null, url: 'https://example.com' },
    ]);
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

  // Only a Contact & Misc row has a description.
  it('strips a description sent on a website or social link', () => {
    expect(
      httpLinkInputSchema.parse({ label: 'Site', description: 'Stray', url: 'https://example.com' })
    ).toEqual({ label: 'Site', url: 'https://example.com' });
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

  it('accepts a link without a description', () => {
    expect(contactLinkInputSchema.parse({ url: 'agent@example.com' })).toEqual({
      url: 'agent@example.com',
    });
  });

  it('accepts a description and trims it', () => {
    expect(
      contactLinkInputSchema.parse({ description: '  Books US tours  ', url: 'agent@example.com' })
    ).toEqual({ description: 'Books US tours', url: 'agent@example.com' });
  });

  it('accepts a description at the length limit', () => {
    const description = 'd'.repeat(MAX_ARTIST_LINK_DESCRIPTION_LENGTH);

    expect(contactLinkInputSchema.parse({ description, url: 'agent@example.com' })).toEqual({
      description,
      url: 'agent@example.com',
    });
  });

  it('rejects a description past the length limit, naming the field', () => {
    const result = contactLinkInputSchema.safeParse({
      description: 'd'.repeat(MAX_ARTIST_LINK_DESCRIPTION_LENGTH + 1),
      url: 'agent@example.com',
    });

    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ['description'], message: 'Description is too long' }),
    ]);
  });

  it('caps a description at 280 characters', () => {
    expect(MAX_ARTIST_LINK_DESCRIPTION_LENGTH).toBe(280);
  });
});

describe('artistLinkGroupInputSchema', () => {
  it('requires a heading once the group has a link', () => {
    const result = artistLinkGroupInputSchema.safeParse({
      heading: ' ',
      links: [{ url: 'https://example.com' }],
    });

    expect(result.success).toBe(false);
  });

  // An added-then-abandoned group is dropped on save, so it must not block it.
  it('accepts an empty group without a heading', () => {
    expect(artistLinkGroupInputSchema.safeParse({ heading: '', links: [] }).success).toBe(true);
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
