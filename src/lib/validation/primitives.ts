/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import { isHttpUrl } from '@/lib/utils/is-http-url';
import { isRealCalendarDate } from '@/lib/utils/validation/iso-date';
import { OBJECT_ID_REGEX } from '@/lib/utils/validation/object-id';

/**
 * The scalar shapes every schema shares, each spelled once. A limit that
 * lives here cannot differ between the form that writes a value and the
 * route that reads it back — which is how a slug could once be saved at 200
 * characters and refused at 101 by the page that served it.
 */

/** A 24-hex MongoDB ObjectId, either case. */
export const objectId = z.string().regex(OBJECT_ID_REGEX, 'Invalid id');

/** The longest slug a public page will serve; the write side must agree. */
export const SLUG_MAX = 100;

/**
 * A URL slug: lowercase alphanumerics separated by single dashes, never
 * starting or ending with one (`john-doe`, not `-john`, `john--doe`).
 */
export const slug = z
  .string()
  .min(1, { message: 'Slug is required' })
  .max(SLUG_MAX, { message: `Slug must be at most ${SLUG_MAX} characters` })
  .regex(/^[a-z0-9](?:[a-z0-9]|-[a-z0-9])*$/, {
    message: 'Slug must be lowercase, alphanumeric, and dash-separated (e.g., "john-doe")',
  });

/** Whether a string is a slug — for callers that gate without parsing. */
export const isSlug = (value: string): boolean => slug.safeParse(value).success;

/** The longest username the change form accepts; every reader must agree. */
export const USERNAME_MAX = 100;

/** A username: letters, digits, underscores and dashes, 2 to `USERNAME_MAX`. */
export const username = z
  .string()
  .min(2)
  .max(USERNAME_MAX, `Username must be ${USERNAME_MAX} characters or fewer`)
  .regex(/^[a-zA-Z0-9_-]+$/, {
    message: 'Invalid username. You can only use letters, numbers, underscores, and dashes.',
  });

/** A day-precision `YYYY-MM-DD` that is a real calendar day. */
export const isoDay = z
  .string()
  .refine(isRealCalendarDate, { message: 'Expected a calendar day as YYYY-MM-DD' });

/**
 * An http(s) URL with a host. `z.string().url()` admits `javascript:` and
 * `data:` schemes, so an externally supplied URL never goes through it.
 */
export const httpUrl = z.string().refine(isHttpUrl, 'Must be an http(s) URL');
