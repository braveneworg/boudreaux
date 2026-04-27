/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { withAuth } from '@/lib/decorators/with-auth';
import { UserService } from '@/lib/services/user-service';
import { changeUsernameSchema } from '@/lib/validation/change-username-schema';

export const POST = withAuth(async (request: NextRequest, _context, session) => {
  try {
    const body = await request.json();
    const { username: usernameInput, confirmUsername } = body;

    // Validate the username using the change-username-schema
    const validationResult = changeUsernameSchema.safeParse({
      username: usernameInput,
      confirmUsername,
    });

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid username format',
          details: validationResult.error.issues,
        },
        { status: 400 }
      );
    }

    const { username } = validationResult.data;

    const result = await UserService.updateUsername(session.user.id, username);

    if (result.duplicate) {
      // Always return 200 with `available: false` to prevent enumeration.
      return NextResponse.json(
        {
          available: false,
          error: 'This username is not available. Please choose another.',
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        available: true,
        success: true,
        message: 'Username updated successfully',
        username,
      },
      { status: 200 }
    );
  } catch (error) {
    // Log safely - don't expose error details in production
    if (process.env.NODE_ENV === 'development') {
      console.error('Error updating username:', error);
    } else {
      console.error(
        'Error updating username:',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
    return NextResponse.json(
      {
        error: 'An error occurred while updating the username',
      },
      { status: 500 }
    );
  }
});
