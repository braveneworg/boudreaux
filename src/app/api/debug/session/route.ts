import { NextResponse } from 'next/server';

import { auth } from '../../../../../auth';

export const GET = async () => {
  try {
    const session = await auth();

    return NextResponse.json({
      session,
      hasSession: !!session,
      hasUser: !!session?.user,
      hasUsername: !!session?.user?.username,
      username: session?.user?.username,
      userId: session?.user?.id,
      userEmail: session?.user?.email,
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
