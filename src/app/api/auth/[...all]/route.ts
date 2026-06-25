/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { toNextJsHandler } from 'better-auth/next-js';

import { auth } from '@/lib/auth';

export const { GET, POST } = toNextJsHandler(auth);
