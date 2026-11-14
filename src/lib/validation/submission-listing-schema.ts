/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import {
  COMMUNITY_LIST_MAX_TAKE,
  COMMUNITY_PAGE_SIZE,
  COMMUNITY_SEARCH_MAX,
  SUBMISSION_CATEGORIES,
} from '@/lib/constants/submissions';
import type { SubmissionCard } from '@/lib/types/domain/submission';

import { USERNAME_MAX } from './primitives';

/**
 * The community page's listing route, both ways: the query it reads and the
 * page it answers. Imported by client hooks, so it must stay free of
 * `server-only` modules.
 */

/** The furthest a list may be paged; far past anything a visitor scrolls to. */
const MAX_SKIP = 100_000;

/**
 * The query string of `GET /api/community/submissions`. Every value arrives
 * as text; an absent one takes its default, and an empty `search` or `user`
 * means no narrowing.
 */
export const submissionListingQuerySchema = z.object({
  skip: z.coerce.number().int().min(0).max(MAX_SKIP).default(0),
  take: z.coerce.number().int().min(1).max(COMMUNITY_LIST_MAX_TAKE).default(COMMUNITY_PAGE_SIZE),
  search: z.string().trim().max(COMMUNITY_SEARCH_MAX).default(''),
  user: z.string().trim().max(USERNAME_MAX).default(''),
});

/** One listed submission as a card, as it arrives over the wire. */
export const submissionCardSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.enum(SUBMISSION_CATEGORIES),
  cardPictureUrl: z.string().nullable(),
  owner: z.object({ username: z.string().nullable(), gravatarHash: z.string() }),
}) satisfies z.ZodType<SubmissionCard>;

/** One page of cards: the rows, and the offset of the next page or `null` at the end. */
export const submissionCardPageSchema = z.object({
  rows: z.array(submissionCardSchema),
  nextSkip: z.number().nullable(),
});

/** One validated page of the listing route. */
export type SubmissionCardPage = z.infer<typeof submissionCardPageSchema>;
