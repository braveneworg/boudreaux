import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { Prisma } from '@prisma/client';

import { withAuth } from '@/app/lib/decorators/with-auth';
import { prisma } from '@/app/lib/prisma';
import changeUsernameSchema from '@/app/lib/validation/change-username-schema';

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

    // Update user in database
    try {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { username },
      });

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
      // Handle duplicate username error
      // Always return 200 with available flag to prevent enumeration
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return NextResponse.json(
          {
            available: false,
            error: 'This username is not available. Please choose another.',
          },
          { status: 200 }
        );
      }

      throw error;
    }
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
