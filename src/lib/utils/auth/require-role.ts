import 'server-only';

import { auth } from '../../../../auth';

import type { Session } from 'next-auth';

export const requireRole = async (role: string): Promise<Session> => {
  const session = await auth();

  if (!session?.user?.role || session.user.role !== role) {
    throw Error('Unauthorized');
  }

  return session;
};
