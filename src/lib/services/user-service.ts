/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { generateUsername } from 'unique-username-generator';

import { prisma } from '../prisma';
import { CustomPrismaAdapter } from '../prisma-adapter';

/** Result of {@link UserService.updateUsername}. */
export interface UpdateUsernameResult {
  /** True when the username was successfully written. */
  success: boolean;
  /** True when the chosen username collided with an existing record. */
  duplicate: boolean;
}

/** Result of {@link UserService.createGuestPurchaser}. */
export interface CreateGuestPurchaserResult {
  /** The user id (newly created or recovered after a P2002 race). */
  id: string;
  /** True when the user was newly created by this call. */
  created: boolean;
}

export const UserService = {
  ensureAdminUser: async ({
    firstName,
    lastName,
    phone,
    email,
    role = 'admin',
  }: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    email: string;
    role?: string;
  }) => {
    const adminUser = await prisma.user.findUnique({
      where: { email },
    });

    if (!adminUser) {
      console.info('🌱 Creating admin user...');
      await prisma.user.create({
        data: {
          firstName,
          lastName,
          phone,
          email,
          name: 'Admin',
          role,
          emailVerified: new Date(),
        },
      });
      console.info(`✅ Admin user, ${email}, created.`);
    } else {
      console.info(`ℹ️ Admin user, ${email}, already exists.`);
    }
  },

  /**
   * Look up a user by email. Returns null when no match is found.
   */
  findByEmail: async (email: string) => prisma.user.findUnique({ where: { email } }),

  /**
   * Look up a user's email address by id. Used by webhooks that need a
   * fallback email address (e.g. embedded Stripe checkout sessions where
   * `customer_details.email` is empty).
   */
  findEmailById: async (id: string): Promise<string | null> => {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { email: true },
    });
    return user?.email ?? null;
  },

  /**
   * Update a user's username. Catches P2002 unique-constraint violations and
   * returns `{ duplicate: true }` so callers can render a uniform "not
   * available" response without leaking the underlying Prisma error.
   */
  updateUsername: async (id: string, username: string): Promise<UpdateUsernameResult> => {
    try {
      await prisma.user.update({
        where: { id },
        data: { username },
      });
      return { success: true, duplicate: false };
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
        return { success: false, duplicate: true };
      }
      throw error;
    }
  },

  /**
   * Create a placeholder user for a first-time guest purchaser so subsequent
   * purchase records can be linked and the auto-login flow can establish a
   * session. Handles concurrent webhook deliveries racing on the unique email
   * index by re-fetching when a P2002 is raised.
   */
  createGuestPurchaser: async (email: string): Promise<CreateGuestPurchaserResult> => {
    const placeholderUsername = generateUsername('', 0, 15);
    try {
      const newUser = await prisma.user.create({
        data: {
          email,
          emailVerified: new Date(),
          username: placeholderUsername,
        },
        select: { id: true },
      });
      return { id: newUser.id, created: true };
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
        const racedUser = await prisma.user.findUnique({
          where: { email },
          select: { id: true },
        });
        if (racedUser) {
          return { id: racedUser.id, created: false };
        }
      }
      throw error;
    }
  },

  /**
   * Create a newsletter subscriber via the Auth.js adapter so the resulting
   * user record is shaped consistently with the rest of the auth flow.
   */
  createSubscriber: async (email: string): Promise<void> => {
    const adapter = CustomPrismaAdapter(prisma);
    if (!adapter.createUser) {
      throw new Error('CustomPrismaAdapter.createUser is not implemented');
    }
    await adapter.createUser({
      id: '',
      email,
      emailVerified: null,
      name: null,
      image: null,
      username: generateUsername('', 4),
    });
  },
};
