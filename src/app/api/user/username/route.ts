import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/app/lib/decorators/with-auth';
import { prisma } from '@/app/lib/prisma';
import changeUsernameSchema from '@/app/lib/validation/change-username-schema';
import { Prisma } from '@prisma/client';

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
          success: true,
          username,
        },
        { status: 200 }
      );
    } catch (error) {
      // Handle duplicate username error
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return NextResponse.json(
          {
            error: 'Username is already taken. Please try again.',
          },
          { status: 409 }
        );
      }

      throw error;
    }
  } catch (error) {
    console.error('Error updating username:', error);
    return NextResponse.json(
      {
        error: 'An error occurred while updating the username',
      },
      { status: 500 }
    );
  }
});
