import { PrismaAdapter } from '@auth/prisma-adapter';
import { generateUsername } from 'unique-username-generator';

import type { PrismaClient } from '@prisma/client';
import type { Adapter } from 'next-auth/adapters';

export function CustomPrismaAdapter(p: PrismaClient): Adapter {
  const baseAdapter = PrismaAdapter(p);

  return {
    ...baseAdapter,
    createUser: async (data) => {
      // Exclude id from data to let MongoDB auto-generate ObjectId
      const { id: _id, ...userData } = data;

      // Check if user already exists by email
      // This prevents duplicate user creation when signing in with email
      if (userData.email) {
        const existingUser = await p.user.findUnique({
          where: { email: userData.email },
        });

        if (existingUser) {
          return {
            id: existingUser.id,
            name: existingUser.name,
            email: existingUser.email!,
            emailVerified: existingUser.emailVerified,
            image: existingUser.image,
            username: existingUser.username ?? undefined,
          };
        }
      }

      // Generate a unique placeholder username to avoid null constraint issues
      // Users will be prompted to set their actual username later
      const placeholderUsername = generateUsername('', 0, 15);

      const user = await p.user.create({
        data: {
          ...userData,
          username: placeholderUsername,
        },
      });
      return {
        id: user.id,
        name: user.name,
        email: user.email!,
        emailVerified: user.emailVerified,
        image: user.image,
        username: user.username ?? undefined,
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
        username: user.username ?? undefined,
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
        username: user.username ?? undefined,
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
        username: account.user.username ?? undefined,
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
        username: user.username ?? undefined,
      };
    },
  } as Adapter;
}
