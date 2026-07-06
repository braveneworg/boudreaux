/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { z } from 'zod';

/**
 * Wire schema for the `GET /api/link-preview` response, validated on the client
 * (`useLinkPreviewQuery`) before use. `resolved:false` means the upstream fetch
 * or extraction degraded gracefully — only `siteName` (the host) is populated
 * and every other field is `null`; the card still renders the bare host.
 */
export const linkPreviewSchema = z.object({
  url: z.string(),
  resolved: z.boolean(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  siteName: z.string().nullable(),
  imageDataUri: z.string().nullable(),
  faviconDataUri: z.string().nullable(),
});

/** Response body of `GET /api/link-preview` (see {@link linkPreviewSchema}). */
export type LinkPreview = z.infer<typeof linkPreviewSchema>;
