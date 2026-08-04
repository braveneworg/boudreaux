/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import type { VideoPosterCandidate } from '@/lib/types/domain/video';
import { isHttpUrl } from '@/lib/utils/is-http-url';

/** One stored poster-frame candidate as accepted from the client. */
export const videoPosterCandidateSchema = z.object({
  url: z.string().max(2048).refine(isHttpUrl, { message: 'Must be an http(s) URL' }),
  atSeconds: z.number().min(0),
  score: z.number().min(0),
}) satisfies z.ZodType<VideoPosterCandidate>;

/** Candidate list cap — 5 captured today; headroom, never unbounded. */
export const posterCandidatesSchema = z.array(videoPosterCandidateSchema).max(10);
