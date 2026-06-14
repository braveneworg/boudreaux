/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

/**
 * Payload accepted by POST /api/client-errors — error-boundary reports from
 * the browser. Deliberately tiny: no stack traces, no user data, hard length
 * caps so the endpoint can't be used to pump arbitrary data into the logs.
 */
export const clientErrorReportSchema = z.object({
  digest: z.string().trim().max(128).optional(),
  message: z.string().trim().min(1).max(500),
  pathname: z.string().trim().min(1).max(300),
  boundary: z.enum(['route', 'global', 'response-validation']),
});

export type ClientErrorReport = z.infer<typeof clientErrorReportSchema>;
