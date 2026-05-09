/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { z } from 'zod';

import { FREE_FORMAT_TYPES, VALID_FORMAT_TYPES } from '@/lib/constants/digital-formats';

const BUNDLE_MODES = ['paid', 'free'] as const;

/**
 * Zod schema for validating the `formats` and `mode` query parameters
 * on the bundle download API route.
 *
 * `formats` is a comma-separated string of valid digital format types
 * (e.g., "FLAC,WAV,MP3_320KBPS"). When `mode` is `'free'` (the freemium
 * download path), every requested format must be one of `FREE_FORMAT_TYPES`
 * (`MP3_320KBPS` or `AAC`); otherwise the request is rejected with the
 * `INVALID_FORMATS` issue.
 *
 * `mode` defaults to `'paid'` for backwards compatibility with existing
 * paid-bundle callers.
 */
export const bundleDownloadQuerySchema = z
  .object({
    formats: z
      .string()
      .min(1, 'At least one format is required')
      .transform((val) => val.split(','))
      .pipe(
        z
          .array(z.enum(VALID_FORMAT_TYPES as unknown as [string, ...string[]]))
          .min(1, 'Select at least one format')
          .max(8, 'Maximum 8 formats per bundle')
      ),
    mode: z.enum(BUNDLE_MODES).optional().default('paid'),
  })
  .superRefine((value, ctx) => {
    if (value.mode !== 'free') return;
    const allowed = new Set<string>(FREE_FORMAT_TYPES);
    const invalid = value.formats.filter((f) => !allowed.has(f));
    if (invalid.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['formats'],
        params: { code: 'INVALID_FORMATS', invalid },
        message: `Free downloads only support ${FREE_FORMAT_TYPES.join(', ')}`,
      });
    }
  });

export type BundleDownloadQuery = z.infer<typeof bundleDownloadQuerySchema>;

/**
 * Zod schema for the `GET /api/releases/{id}/download/free-status` response
 * (007-free-digital-downloads).
 *
 * @see specs/007-free-digital-downloads/contracts/bundle-endpoint.md §1
 */
export const FreeStatusResponseSchema = z.object({
  allowed: z.boolean(),
  remaining: z.number().int().min(0).max(3),
  windowSeconds: z.literal(86_400),
  resetsAtIso: z.string().datetime().nullable(),
  blockedReason: z.enum(['cap-reached', 'no-free-formats']).nullable(),
  availableFreeFormats: z.array(z.enum(FREE_FORMAT_TYPES)),
});

export type FreeStatusResponse = z.infer<typeof FreeStatusResponseSchema>;

/**
 * Cap-reached error response body for the bundle endpoint
 * (HTTP 403, errorCode `CAP_REACHED`).
 */
export const CapReachedErrorResponseSchema = z.object({
  errorCode: z.literal('CAP_REACHED'),
  message: z.string(),
  resetsAtIso: z.string().datetime(),
});

export type CapReachedErrorResponse = z.infer<typeof CapReachedErrorResponseSchema>;

/**
 * Lock-held error response body for the bundle endpoint
 * (HTTP 409, errorCode `LOCK_HELD`).
 */
export const LockHeldErrorResponseSchema = z.object({
  errorCode: z.literal('LOCK_HELD'),
  message: z.string(),
});

export type LockHeldErrorResponse = z.infer<typeof LockHeldErrorResponseSchema>;

/**
 * No-free-formats error response body for the bundle endpoint
 * (HTTP 400, errorCode `NO_FREE_FORMATS_AVAILABLE`).
 */
export const NoFreeFormatsErrorResponseSchema = z.object({
  errorCode: z.literal('NO_FREE_FORMATS_AVAILABLE'),
  message: z.string(),
});

export type NoFreeFormatsErrorResponse = z.infer<typeof NoFreeFormatsErrorResponseSchema>;
