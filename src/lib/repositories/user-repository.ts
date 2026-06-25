/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { prisma } from '@/lib/prisma';
import type {
  CreateUserData,
  UpdateUserProfileData,
  User,
  UserAdminRecord,
  UserContactRecord,
  UserEmailRecord,
  UserIdRecord,
  UserUsernameRecord,
} from '@/lib/types/domain/user';

import { runQuery } from './_internal/map-prisma-error';

import type { AssertExact } from './_internal/drift';
import type { Prisma } from '@prisma/client';

// =============================================================================
// Query shapes (single source of truth for both the query and the drift check)
// =============================================================================

/** Full user include — accounts + sessions, matching the media `User` payload. */
const userFullInclude = {
  accounts: true,
  sessions: true,
} as const satisfies Prisma.UserInclude;

// Compile-time drift guard: fail `pnpm run typecheck` if the hand-written `User`
// domain type diverges from the Prisma payload the full-include query returns.
type _UserDrift = AssertExact<User, Prisma.UserGetPayload<{ include: typeof userFullInclude }>>;
const _userDrift: _UserDrift = true;

// =============================================================================
// Translators (domain input -> Prisma input)
// =============================================================================

/** Build a Prisma create payload from domain create data. */
const toPrismaCreate = (data: CreateUserData): Prisma.UserCreateInput => ({ ...data });

/**
 * Data-access layer for the User model. The only layer that touches Prisma for
 * users: it owns the include shape, translates domain input to Prisma input, and
 * wraps every call in `runQuery` so callers see vendor-neutral `DataError`s and
 * hand-written domain types.
 */
export class UserRepository {
  /** Look up a full user record by email. Returns `null` when not found. */
  static async findByEmail(email: string): Promise<User | null> {
    return runQuery(() =>
      prisma.user.findUnique({ where: { email }, include: userFullInclude })
    ) as Promise<User | null>;
  }

  /** Look up a full user record by id. Returns `null` when not found. */
  static async findById(id: string): Promise<User | null> {
    return runQuery(() =>
      prisma.user.findUnique({ where: { id }, include: userFullInclude })
    ) as Promise<User | null>;
  }

  /** Look up a user by email, selecting only their id. */
  static async findIdByEmail(email: string): Promise<UserIdRecord | null> {
    return runQuery(() => prisma.user.findUnique({ where: { email }, select: { id: true } }));
  }

  /** Look up a user by id, selecting only their email. */
  static async findEmailById(id: string): Promise<UserEmailRecord | null> {
    return runQuery(() => prisma.user.findUnique({ where: { id }, select: { email: true } }));
  }

  /** Look up a user by username, selecting id, username and email. */
  static async findByUsername(username: string): Promise<UserContactRecord | null> {
    return runQuery(() =>
      prisma.user.findUnique({
        where: { username },
        select: { id: true, username: true, email: true },
      })
    );
  }

  /** Create a user with the supplied data, returning the full user payload. */
  static async create(data: CreateUserData): Promise<User> {
    return runQuery(() =>
      prisma.user.create({ data: toPrismaCreate(data), include: userFullInclude })
    ) as Promise<User>;
  }

  /** Create a guest user, returning only the new id. */
  static async createGuest(data: CreateUserData): Promise<UserIdRecord> {
    return runQuery(() => prisma.user.create({ data: toPrismaCreate(data), select: { id: true } }));
  }

  /** Update a user's username, returning the full user payload. */
  static async updateUsername(id: string, username: string): Promise<User> {
    return runQuery(() =>
      prisma.user.update({ where: { id }, data: { username }, include: userFullInclude })
    ) as Promise<User>;
  }

  /**
   * Update a user's email, preserving the prior address in `previousEmail` so
   * downstream flows (audit, re-verification) can reference it. Returns the full
   * user payload.
   */
  static async updateEmail(id: string, email: string, previousEmail: string): Promise<User> {
    return runQuery(() =>
      prisma.user.update({
        where: { id },
        data: { email, previousEmail },
        include: userFullInclude,
      })
    ) as Promise<User>;
  }

  /**
   * Update a user's editable profile fields, returning the full user payload.
   */
  static async updateProfile(id: string, data: UpdateUserProfileData): Promise<User> {
    return runQuery(() =>
      prisma.user.update({ where: { id }, data, include: userFullInclude })
    ) as Promise<User>;
  }

  /**
   * Case-insensitive username prefix search, excluding the caller.
   * Capped at `take` rows and ordered by username ascending.
   */
  static async searchByUsernamePrefix(
    prefix: string,
    excludeUserId: string,
    take: number
  ): Promise<UserUsernameRecord[]> {
    return runQuery(() =>
      prisma.user.findMany({
        where: {
          username: { startsWith: prefix, mode: 'insensitive' },
          NOT: { id: excludeUserId },
        },
        select: { id: true, username: true },
        take,
        orderBy: { username: 'asc' },
      })
    );
  }

  /**
   * Resolve a list of usernames to user rows (case-insensitive),
   * excluding the author so self-mentions don't match.
   */
  static async findByUsernames(
    usernames: string[],
    excludeUserId: string
  ): Promise<UserContactRecord[]> {
    return runQuery(() =>
      prisma.user.findMany({
        where: {
          username: { in: usernames, mode: 'insensitive' },
          NOT: { id: excludeUserId },
        },
        select: { id: true, username: true, email: true },
      })
    );
  }

  /** Fetch every admin user with the fields needed for notification fan-out. */
  static async findAdmins(): Promise<UserAdminRecord[]> {
    return runQuery(() =>
      prisma.user.findMany({
        where: { role: 'admin' },
        select: {
          id: true,
          email: true,
          username: true,
          phone: true,
          allowSmsNotifications: true,
        },
      })
    );
  }
}
