/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

/**
 * Input for the admin "set runtime log level" action.
 * `level: null` clears the override; `ttlMinutes` only applies when a level
 * is set (the action defaults it to 60 minutes).
 */
export const setLogLevelSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']).nullable(),
  ttlMinutes: z.number().int().min(5).max(1440).optional(),
});

export type SetLogLevelInput = z.infer<typeof setLogLevelSchema>;
