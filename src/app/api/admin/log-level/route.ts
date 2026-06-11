/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/decorators/with-auth';
import { getLogLevelState } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/log-level
 * Current runtime log-level state (configured default, active override,
 * expiry). Mutations go through the setLogLevelAction Server Action.
 */
export const GET = withAdmin(async () => {
  return NextResponse.json(getLogLevelState());
});
