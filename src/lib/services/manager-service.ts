/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { CONSTANTS } from '@/lib/constants';
import { UserRepository } from '@/lib/repositories/user-repository';
import { DataError } from '@/lib/types/domain/errors';
import type { UserRoleRecord } from '@/lib/types/domain/user';

/** A manager as the admin screen lists them. Never their email. */
export interface ManagerRow {
  id: string;
  username: string | null;
}

/** The role a user holds when they hold no other. */
const USER_ROLE = 'user';

const NO_SUCH_USER_MESSAGE = 'No user has that username.';

/** The user with a username, or the refusal for there being none. */
const requireUser = async (username: string): Promise<UserRoleRecord> => {
  const user = await UserRepository.findRoleByUsername(username);
  if (!user) {
    throw new DataError('NOT_FOUND', NO_SUCH_USER_MESSAGE);
  }

  return user;
};

/**
 * Who is a manager (ADR-0025): an approver and nothing more, granted and
 * removed by an admin. The session's user is read from the database on every
 * request, so a role change holds from the user's next request without their
 * signing out. Messages here are written for the admin and shown as is.
 */
export class ManagerService {
  /** Every manager, by username. */
  static async list(): Promise<ManagerRow[]> {
    const managers = await UserRepository.findManagers();

    return managers.map(({ id, username }) => ({ id, username }));
  }

  /**
   * Make a user a manager. Refuses an unknown username, a banned account, and
   * a user who can already approve.
   */
  static async grant(username: string): Promise<void> {
    const user = await requireUser(username);

    if (user.banned === true) {
      throw new DataError(
        'INVALID_INPUT',
        'That account is suspended, so it cannot be made a manager.'
      );
    }

    if (user.role === CONSTANTS.ROLES.ADMIN) {
      throw new DataError(
        'INVALID_INPUT',
        'That user is an admin, who can already approve submissions.'
      );
    }

    if (user.role === CONSTANTS.ROLES.MANAGER) {
      throw new DataError('INVALID_INPUT', 'That user is already a manager.');
    }

    await UserRepository.setRole(user.id, CONSTANTS.ROLES.MANAGER);
  }

  /** Return a manager to the user role. Refuses anyone who is not a manager. */
  static async remove(username: string): Promise<void> {
    const user = await requireUser(username);

    if (user.role !== CONSTANTS.ROLES.MANAGER) {
      throw new DataError('INVALID_INPUT', 'That user is not a manager.');
    }

    await UserRepository.setRole(user.id, USER_ROLE);
  }
}
