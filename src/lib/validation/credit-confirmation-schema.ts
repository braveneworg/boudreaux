/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { z } from 'zod';

import type { CreditConfirmation, PublishedWorkCreditedTo } from '@/lib/utils/credit-confirmation';

const creditAwaitingConfirmationSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  bioState: z.enum(['none', 'hand-written', 'generated']),
  bioGeneratedAt: z.coerce.date().nullable(),
  displayImageCount: z.number().int().nonnegative(),
});

const creditThatStaysHiddenSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  reason: z.enum(['deleted', 'no-departure-date']),
});

/** The response of the two credits routes (ADR-0015). */
export const creditConfirmationSchema = z.object({
  awaiting: z.array(creditAwaitingConfirmationSchema),
  stayHidden: z.array(creditThatStaysHiddenSchema),
}) satisfies z.ZodType<CreditConfirmation, unknown>;

/** The response of `/api/artists/[id]/published-work`. */
export const publishedWorkSchema = z.object({
  releases: z.array(z.object({ id: z.string(), title: z.string() })),
  tourDates: z.array(
    z.object({
      id: z.string(),
      startDate: z.coerce.date(),
      tourId: z.string(),
      tourTitle: z.string(),
    })
  ),
}) satisfies z.ZodType<PublishedWorkCreditedTo, unknown>;
