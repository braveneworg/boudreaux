/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { PrismaAdapter } from '@auth/prisma-adapter';
import { generateUsername } from 'unique-username-generator';

import type { prisma } from '@/lib/prisma';
import { loggers } from '@/lib/utils/logger';

import type { PrismaClient, User } from '@prisma/client';
import type { Adapter } from 'next-auth/adapters';

const logger = loggers.database;

/** The app singleton is an $extends-ed client (slow-query logging) */
type AdapterPrismaClient = PrismaClient | typeof prisma;

/**
 * The base `Adapter` type marks every method optional, but this adapter always
 * implements `createUser`, `updateUser`, and `useVerificationToken`. Marking them
 * required lets callers use them without non-null assertions.
 */
type CustomAdapter = Adapter &
  Required<Pick<Adapter, 'createUser' | 'updateUser' | 'useVerificationToken'>>;

const toAdapterUser = (user: User) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  emailVerified: user.emailVerified,
  image: user.image,
  username: user.username ?? undefined,
});

const createUserOverride =
  (p: AdapterPrismaClient) => async (data: Parameters<NonNullable<Adapter['createUser']>>[0]) => {
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

          return toAdapterUser(updatedUser);
        }

        return toAdapterUser(existingUser);
      }
    }

    // Generate a unique placeholder username to avoid null constraint issues.
    // Users will be prompted to set their actual username later. The
    // generator can return characters like apostrophes (e.g. "ne'er") that
    // are unsafe for URLs and display — strip anything that isn't
    // lowercase-alphanumeric or hyphen.
    const placeholderUsername = generateUsername('', 0, 15).replace(/[^a-z0-9-]/g, '');

    const user = await p.user.create({
      data: {
        ...userData,
        username: placeholderUsername,
      },
    });
    return toAdapterUser(user);
  };

const getUserOverride =
  (p: AdapterPrismaClient) => async (id: Parameters<NonNullable<Adapter['getUser']>>[0]) => {
    const user = await p.user.findUnique({
      where: { id },
    });
    if (!user) return null;

    return toAdapterUser(user);
  };

const getUserByEmailOverride =
  (p: AdapterPrismaClient) =>
  async (email: Parameters<NonNullable<Adapter['getUserByEmail']>>[0]) => {
    const user = await p.user.findUnique({
      where: { email },
    });
    if (!user) return null;

    return toAdapterUser(user);
  };

const getUserByAccountOverride =
  (p: AdapterPrismaClient) =>
  async (provider_providerAccountId: Parameters<NonNullable<Adapter['getUserByAccount']>>[0]) => {
    const account = await p.account.findUnique({
      where: { provider_providerAccountId },
      select: { user: true },
    });
    if (!account?.user) return null;

    return toAdapterUser(account.user);
  };

const updateUserOverride =
  (p: AdapterPrismaClient) => async (data: Parameters<NonNullable<Adapter['updateUser']>>[0]) => {
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
    return toAdapterUser(user);
  };

const updateEmailVerifiedForIdentifier = async (p: AdapterPrismaClient, identifier: string) => {
  try {
    const user = await p.user.findUnique({
      where: { email: identifier },
    });

    if (user && !user.emailVerified) {
      await p.user.update({
        where: { id: user.id },
        data: { emailVerified: new Date() },
      });
    }
  } catch (error) {
    // Log error but don't fail the verification
    logger.error('[CustomPrismaAdapter] Error updating emailVerified', error);
  }
};

const useVerificationTokenOverride =
  (p: AdapterPrismaClient, baseAdapter: Adapter): NonNullable<Adapter['useVerificationToken']> =>
  async (params) => {
    try {
      // Call the base adapter's useVerificationToken to consume the token
      if (!baseAdapter.useVerificationToken) {
        logger.error('[CustomPrismaAdapter] useVerificationToken not found on base adapter');
        return null;
      }

      const verificationToken = await baseAdapter.useVerificationToken(params);

      if (verificationToken) {
        // Update the user's emailVerified field when they use the token
        await updateEmailVerifiedForIdentifier(p, params.identifier);
      }

      return verificationToken;
    } catch (error) {
      // Log and rethrow to maintain original behavior
      logger.error('[CustomPrismaAdapter] Error in useVerificationToken', error);
      throw error;
    }
  };

export const CustomPrismaAdapter = (p: AdapterPrismaClient): CustomAdapter => {
  // @auth/prisma-adapter v2 declares `PrismaClient | ReturnType<PrismaClient["$extends"]>`,
  // which TypeScript cannot resolve against @prisma/client v6's deeply-generic client
  // type (TS2321 "Excessive stack depth"). Cast to the function's own parameter type
  // to skip the structural check — runtime behavior is unaffected.
  const baseAdapter = PrismaAdapter(p as Parameters<typeof PrismaAdapter>[0]);
  return {
    ...baseAdapter,
    useVerificationToken: useVerificationTokenOverride(p, baseAdapter),
    createUser: createUserOverride(p),
    getUser: getUserOverride(p),
    getUserByEmail: getUserByEmailOverride(p),
    getUserByAccount: getUserByAccountOverride(p),
    updateUser: updateUserOverride(p),
  } as CustomAdapter;
};
