/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { generateUsername } from 'unique-username-generator';

import { UserRepository } from '@/lib/repositories/user-repository';
import { DataError } from '@/lib/types/domain/errors';
import { loggers } from '@/lib/utils/logger';

/** Result of {@link UserService.updateUsername}. */
export interface UpdateUsernameResult {
  /** True when the username was successfully written. */
  success: boolean;
  /** True when the chosen username collided with an existing record. */
  duplicate: boolean;
}

/** Result of {@link UserService.createGuestPurchaser}. */
export interface CreateGuestPurchaserResult {
  /** The user id (newly created or recovered after a duplicate-email race). */
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
    const adminUser = await UserRepository.findByEmail(email);

    if (!adminUser) {
      loggers.auth.info('🌱 Creating admin user...');
      await UserRepository.create({
        firstName,
        lastName,
        phone,
        email,
        name: 'Admin',
        role,
        emailVerified: true,
      });
      loggers.auth.info(`✅ Admin user, ${email}, created.`);
    } else {
      loggers.auth.info(`ℹ️ Admin user, ${email}, already exists.`);
    }
  },

  /**
   * Look up a user by email. Returns null when no match is found.
   */
  findByEmail: async (email: string) => UserRepository.findByEmail(email),

  /**
   * Look up a user's email address by id. Used by webhooks that need a
   * fallback email address (e.g. embedded Stripe checkout sessions where
   * `customer_details.email` is empty).
   */
  findEmailById: async (id: string): Promise<string | null> => {
    const user = await UserRepository.findEmailById(id);
    return user?.email ?? null;
  },

  /**
   * Update a user's username. Catches duplicate-key violations (surfaced by the
   * repository as a {@link DataError} with code `DUPLICATE`) and returns
   * `{ duplicate: true }` so callers can render a uniform "not available"
   * response without leaking the underlying data-access error.
   */
  updateUsername: async (id: string, username: string): Promise<UpdateUsernameResult> => {
    try {
      await UserRepository.updateUsername(id, username);
      return { success: true, duplicate: false };
    } catch (error) {
      if (error instanceof DataError && error.code === 'DUPLICATE') {
        return { success: false, duplicate: true };
      }
      throw error;
    }
  },

  /**
   * Create a placeholder user for a first-time guest purchaser so subsequent
   * purchase records can be linked and the auto-login flow can establish a
   * session. Handles concurrent webhook deliveries racing on the unique email
   * index by re-fetching when a duplicate-key error is raised.
   */
  createGuestPurchaser: async (email: string): Promise<CreateGuestPurchaserResult> => {
    const placeholderUsername = generateUsername('', 0, 15);
    try {
      const newUser = await UserRepository.createGuest({
        email,
        emailVerified: true,
        username: placeholderUsername,
      });
      return { id: newUser.id, created: true };
    } catch (error) {
      if (error instanceof DataError && error.code === 'DUPLICATE') {
        const racedUser = await UserRepository.findIdByEmail(email);
        if (racedUser) {
          return { id: racedUser.id, created: false };
        }
      }
      throw error;
    }
  },
};
