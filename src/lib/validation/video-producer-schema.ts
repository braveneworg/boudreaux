/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

/** One producer entry from the admin video form: existing id or new free-text name. */
export const videoProducerSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(200),
});

export type VideoProducerInput = z.infer<typeof videoProducerSchema>;
