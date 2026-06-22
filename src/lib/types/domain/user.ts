/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Hand-written, Prisma-free mirrors of the Prisma `User` graph (plus its
 * `accounts` and `sessions` relations). The full-include `User` output type is
 * drift-checked against `Prisma.UserGetPayload` inside user-repository, so a
 * schema change that isn't reflected here fails `pnpm run typecheck`.
 */

// =============================================================================
// Output records
// =============================================================================

/**
 * Scalar fields of the Prisma `User` model (no relations loaded). Declared as a
 * `type` (not `interface`) so user payloads remain assignable to
 * `Record<string, unknown>`.
 */
export type UserScalars = {
  id: string;
  name: string | null;
  email: string;
  emailVerified: Date | null;
  previousEmail: string | null;
  image: string | null;
  termsAndConditions: boolean;
  username: string | null;
  role: string | null;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  country: string | null;
  allowSmsNotifications: boolean | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Scalar fields of the Prisma `Account` model (`accounts: true`). */
export type AccountRecord = {
  id: string;
  userId: string;
  type: string;
  provider: string;
  providerAccountId: string;
  refresh_token: string | null;
  access_token: string | null;
  expires_at: number | null;
  token_type: string | null;
  scope: string | null;
  id_token: string | null;
  session_state: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Scalar fields of the Prisma `Session` model (`sessions: true`). */
export type SessionRecord = {
  id: string;
  sessionToken: string;
  userId: string;
  expires: Date;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Full user payload: scalars plus loaded `accounts` and `sessions`. Mirrors
 * `Prisma.UserGetPayload<{ include: { accounts: true; sessions: true } }>`.
 */
export type User = UserScalars & {
  accounts: AccountRecord[];
  sessions: SessionRecord[];
};

/** Narrow id projection returned by guest-create / id-by-email lookups. */
export interface UserIdRecord {
  id: string;
}

/** Email projection returned by the id-to-email lookup. */
export interface UserEmailRecord {
  email: string | null;
}

/** Username-search projection (id + username). */
export interface UserUsernameRecord {
  id: string;
  username: string | null;
}

/** Username + email projection (mentions resolution, by-username lookup). */
export interface UserContactRecord {
  id: string;
  username: string | null;
  email: string | null;
}

/** Admin notification fan-out projection. */
export interface UserAdminRecord {
  id: string;
  email: string;
  username: string | null;
  phone: string | null;
  allowSmsNotifications: boolean | null;
}

// =============================================================================
// Input types
// =============================================================================

/**
 * Writable user scalar fields accepted by the repository create method. Mirrors
 * the subset of Prisma's `UserCreateInput` the service layer actually writes.
 */
export interface CreateUserData {
  email: string;
  name?: string | null;
  emailVerified?: Date | null;
  image?: string | null;
  username?: string | null;
  role?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
}
