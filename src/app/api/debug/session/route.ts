/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextResponse } from 'next/server';

import { auth } from '../../../../../auth';

/**
 * Debug endpoint to check session data.
 * SECURITY: Requires admin authentication - session data should not be publicly accessible.
 */
export const GET = async () => {
  try {
    const session = await auth();

    // Require authentication to view session debug info
    if (!session?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Only admins can view full session debug data
    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    return NextResponse.json({
      hasSession: !!session,
      hasUser: !!session?.user,
      hasUsername: !!session?.user?.username,
      username: session?.user?.username,
      userId: session?.user?.id,
      userEmail: session?.user?.email,
      userRole: session?.user?.role,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to get session',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
};
