/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { z } from 'zod';

import { isHttpUrl } from '@/lib/utils/is-http-url';
import { bioStatusLinkUrlSchema } from '@/lib/validation/bio-generation-schema';

/** Drag MIME type for palette link tiles → the bio editors. */
export const BIO_LINK_DRAG_MIME = 'application/x-bio-link';
/** Drag MIME type for palette image tiles → the bio editors. */
export const BIO_IMAGE_DRAG_MIME = 'application/x-bio-image';

// Drag data is external input (a hostile page can set these MIME types), so
// both url fields constrain the scheme: links allow http(s) or site-relative
// (release links are `/releases/<id>` paths); image sources are always remote,
// so http(s) only. Rejects `javascript:`/`data:`/protocol-relative payloads.
export const bioLinkDragPayloadSchema = z.object({
  label: z.string().min(1),
  url: bioStatusLinkUrlSchema,
  kind: z.string().nullable(),
  isExternal: z.boolean(),
});
export type BioLinkDragPayload = z.infer<typeof bioLinkDragPayloadSchema>;

export const bioImageDragPayloadSchema = z.object({
  url: z.string().refine(isHttpUrl, 'Must be an http(s) URL'),
  thumbnailUrl: z.string().nullable(),
  title: z.string().nullable(),
  attribution: z.string().nullable(),
  alt: z.string(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
});
export type BioImageDragPayload = z.infer<typeof bioImageDragPayloadSchema>;
