/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import type { ArtistLink, ArtistLinkGroup, ArtistLinks } from '@/lib/types/domain/artist';
import { toContactHref } from '@/lib/utils/artist-links';
import { isHttpUrl } from '@/lib/utils/is-http-url';

// ---------------------------------------------------------------------------
// Stored shape
// ---------------------------------------------------------------------------

/**
 * The stored shape of an artist's curated links (ADR-0020), as a read payload
 * carries it: no scheme rule here, since a stored href was checked on its
 * way in and is checked again at render.
 */
export const artistLinkSchema = z.object({
  label: z.string().nullable(),
  url: z.string(),
}) satisfies z.ZodType<ArtistLink>;

export const artistLinkGroupSchema = z.object({
  heading: z.string(),
  links: z.array(artistLinkSchema),
}) satisfies z.ZodType<ArtistLinkGroup>;

export const artistLinksSchema = z.object({
  websites: z.array(artistLinkSchema),
  social: z.array(artistLinkSchema),
  contact: z.array(artistLinkGroupSchema),
}) satisfies z.ZodType<ArtistLinks>;

// ---------------------------------------------------------------------------
// Form input (the admin artist form's three link arrays)
// ---------------------------------------------------------------------------

export const MAX_ARTIST_LINK_LABEL_LENGTH = 120;
export const MAX_ARTIST_LINK_HEADING_LENGTH = 80;
export const MAX_ARTIST_LINK_URL_LENGTH = 2048;

/**
 * Request-size guards, not product caps: how many links an artist has is
 * the admin's call (ADR-0020). These only keep a hostile payload from
 * carrying thousands of rows.
 */
export const MAX_ARTIST_LINKS_PER_SECTION = 200;
export const MAX_ARTIST_LINK_GROUPS = 50;

// Optional rather than defaulted: a default would give the form schema
// different input and output types, which the form's resolver typing rejects.
const label = z.string().trim().max(MAX_ARTIST_LINK_LABEL_LENGTH, 'Label is too long').optional();

const url = z
  .string()
  .trim()
  .min(1, 'Enter a URL')
  .max(MAX_ARTIST_LINK_URL_LENGTH, 'URL is too long');

/** A Websites or Social Media row: an http(s) URL with an optional label. */
export const httpLinkInputSchema = z.object({
  label,
  url: url.refine(isHttpUrl, 'Must be an http(s) URL'),
});

/**
 * A Contact & Misc row: an http(s) URL, an email address or a phone number,
 * kept as typed here and normalised on save (see `normalizeArtistLinks`).
 */
export const contactLinkInputSchema = z.object({
  label,
  url: url.refine(
    (value) => toContactHref(value) !== null,
    'Must be an http(s) URL, an email address or a phone number'
  ),
});

/**
 * A Contact & Misc group: a heading over its rows. The heading is required
 * only once the group has a link — a group with none (a prefilled heading, or
 * one added and abandoned) is dropped on save, so it must not block the save.
 */
export const artistLinkGroupInputSchema = z
  .object({
    heading: z.string().trim().max(MAX_ARTIST_LINK_HEADING_LENGTH, 'Heading is too long'),
    links: z.array(contactLinkInputSchema).max(MAX_ARTIST_LINKS_PER_SECTION, 'Too many links'),
  })
  .superRefine(({ heading, links }, ctx) => {
    if (links.length > 0 && heading === '') {
      ctx.addIssue({ code: 'custom', path: ['heading'], message: 'Enter a heading' });
    }
  });

/** The form's three link arrays; the Server Action composes `Artist.links` from them. */
export const artistLinksFormSchema = z.object({
  websiteLinks: z.array(httpLinkInputSchema).max(MAX_ARTIST_LINKS_PER_SECTION, 'Too many links'),
  socialLinks: z.array(httpLinkInputSchema).max(MAX_ARTIST_LINKS_PER_SECTION, 'Too many links'),
  contactLinkGroups: z
    .array(artistLinkGroupInputSchema)
    .max(MAX_ARTIST_LINK_GROUPS, 'Too many groups'),
});

export type ArtistLinksFormValues = z.infer<typeof artistLinksFormSchema>;
export type ArtistLinksFormInput = z.input<typeof artistLinksFormSchema>;
