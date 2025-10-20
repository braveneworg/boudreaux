import { PrismaAdapter } from '@auth/prisma-adapter';

import type { PrismaClient } from '@prisma/client';
import type { Adapter } from 'next-auth/adapters';

export function CustomPrismaAdapter(p: PrismaClient): Adapter {
  const baseAdapter = PrismaAdapter(p);

  return {
    ...baseAdapter,
    ...baseAdapter,
    createUser: async (data) => {
      const user = await p.user.create({
        data: {
          ...data,
        },
      });
      return {
        id: user.id,
        name: user.name,
        email: user.email!,
        emailVerified: user.emailVerified,
        image: user.image,
        username: user.username || '',
      };
    },

    // Override getUser to return extra fields
    getUser: async (id) => {
      const user = await p.user.findUnique({
        where: { id },
      });
      if (!user) return null;

      return {
        id: user.id,
        name: user.name,
        email: user.email!,
        emailVerified: user.emailVerified,
        image: user.image,
        username: user.username || '',
      };
    },

    // Override getUserByEmail to return extra fields
    getUserByEmail: async (email) => {
      const user = await p.user.findUnique({
        where: { email },
      });
      if (!user) return null;

      return {
        id: user.id,
        name: user.name,
        email: user.email!,
        emailVerified: user.emailVerified,
        image: user.image,
        username: user.username || '',
      };
    },

    // Override getUserByAccount to return extra fields
    getUserByAccount: async (provider_providerAccountId) => {
      const account = await p.account.findUnique({
        where: { provider_providerAccountId },
        select: { user: true },
      });
      if (!account?.user) return null;

      return {
        id: account.user.id,
        name: account.user.name,
        email: account.user.email!,
        emailVerified: account.user.emailVerified,
        image: account.user.image,
        username: account.user.username || '',
      };
    },

    // Override updateUser to allow updating extra fields
    updateUser: async (data) => {
      const { id, ...updateData } = data;
      const user = await p.user.update({
        where: { id },
        data: updateData,
      });
      return {
        id: user.id,
        name: user.name,
        email: user.email!,
        emailVerified: user.emailVerified,
        image: user.image,
        username: user.username || '',
      };
    },
  } as Adapter;
}
