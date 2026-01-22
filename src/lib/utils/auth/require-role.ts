import 'server-only';

import { auth } from '../../../../auth';

import type { Session } from 'next-auth';

export const requireRole = async (role: string) => {
  return auth().then((session: Session | null) => {
    if (!session?.user?.role || session.user.role !== role) {
      throw Error('Unauthorized');
    }
  });
};
