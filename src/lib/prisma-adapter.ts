import 'server-only';

import { PrismaAdapter } from '@auth/prisma-adapter';
import { generateUsername } from 'unique-username-generator';

import type { PrismaClient } from '@prisma/client';
import type { Adapter } from 'next-auth/adapters';

export function CustomPrismaAdapter(p: PrismaClient): Adapter {
  const baseAdapter = PrismaAdapter(p);

  return {
    ...baseAdapter,
    // Override useVerificationToken to ensure emailVerified is updated
    useVerificationToken: async (params) => {
      try {
        // Call the base adapter's useVerificationToken to consume the token
        if (!baseAdapter.useVerificationToken) {
          console.error('[CustomPrismaAdapter] useVerificationToken not found on base adapter');
          return null;
        }

        const verificationToken = await baseAdapter.useVerificationToken(params);

        if (verificationToken) {
          // Update the user's emailVerified field when they use the token
          try {
            const user = await p.user.findUnique({
              where: { email: params.identifier },
            });

            if (user && !user.emailVerified) {
              await p.user.update({
                where: { id: user.id },
                data: { emailVerified: new Date() },
              });
            }
          } catch (error) {
            // Log error but don't fail the verification
            console.error('[CustomPrismaAdapter] Error updating emailVerified:', error);
          }
        }

        return verificationToken;
      } catch (error) {
        // Log and rethrow to maintain original behavior
        console.error('[CustomPrismaAdapter] Error in useVerificationToken:', error);
        throw error;
      }
    },

    createUser: async (data) => {
      // Exclude id from data to let MongoDB auto-generate ObjectId
      const { id: _id, ...userData } = data;

      // Ensure emailVerified is a Date object, not a string
      // Auth.js may pass it as a string after JWT/session deserialization
      if (userData.emailVerified && typeof userData.emailVerified === 'string') {
        userData.emailVerified = new Date(userData.emailVerified);
      }

      // Check if user already exists by email
      // This prevents duplicate user creation when signing in with email
      if (userData.email) {
        const existingUser = await p.user.findUnique({
          where: { email: userData.email },
        });

        if (existingUser) {
          // Update emailVerified if provided in data (e.g., from magic link verification)
          // This ensures the user's email is marked as verified when they click the magic link
          if (userData.emailVerified && userData.emailVerified !== existingUser.emailVerified) {
            const updatedUser = await p.user.update({
              where: { id: existingUser.id },
              data: { emailVerified: userData.emailVerified },
            });

            return {
              id: updatedUser.id,
              name: updatedUser.name,
              email: updatedUser.email!,
              emailVerified: updatedUser.emailVerified,
              image: updatedUser.image,
              username: updatedUser.username ?? undefined,
            };
          }

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
      // Users will be prompted to set their actual us  ername later
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

      // Ensure emailVerified is a Date object, not a string
      // Auth.js may pass it as a string after JWT/session deserialization
      if (updateData.emailVerified && typeof updateData.emailVerified === 'string') {
        updateData.emailVerified = new Date(updateData.emailVerified);
      }

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
