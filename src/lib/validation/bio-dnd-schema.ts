/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { z } from 'zod';

/** Drag MIME type for palette link tiles → the bio editors. */
export const BIO_LINK_DRAG_MIME = 'application/x-bio-link';
/** Drag MIME type for palette image tiles → the bio editors. */
export const BIO_IMAGE_DRAG_MIME = 'application/x-bio-image';

export const bioLinkDragPayloadSchema = z.object({
  label: z.string().min(1),
  url: z.string().min(1),
  kind: z.string().nullable(),
  isExternal: z.boolean(),
});
export type BioLinkDragPayload = z.infer<typeof bioLinkDragPayloadSchema>;

export const bioImageDragPayloadSchema = z.object({
  url: z.string().min(1),
  thumbnailUrl: z.string().nullable(),
  title: z.string().nullable(),
  attribution: z.string().nullable(),
  alt: z.string(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
});
export type BioImageDragPayload = z.infer<typeof bioImageDragPayloadSchema>;
