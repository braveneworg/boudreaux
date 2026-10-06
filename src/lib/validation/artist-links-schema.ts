/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import type { ArtistLink, ArtistLinkGroup, ArtistLinks } from '@/lib/types/domain/artist';

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
