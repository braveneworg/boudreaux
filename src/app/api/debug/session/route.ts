/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/decorators/with-auth';

/**
 * Debug endpoint to check session data.
 * SECURITY: Requires admin authentication - session data should not be publicly accessible.
 */
export const GET = withAdmin(async (_request, _context, session) => {
  // Debug endpoints are disabled in production
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    return NextResponse.json({
      hasSession: true,
      hasUser: true,
      hasUsername: !!(session.user as { username?: string }).username,
      username: (session.user as { username?: string }).username,
      userId: session.user.id,
      userEmail: session.user.email,
      userRole: session.user.role,
    });
  } catch {
    return NextResponse.json(
      {
        error: 'Failed to get session',
        message: 'An unexpected error occurred.',
      },
      { status: 500 }
    );
  }
});
