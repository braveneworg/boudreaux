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
  // better-auth: boolean verification flag (was DateTime? under Auth.js).
  emailVerified: boolean;
  email: string;
  previousEmail: string | null;
  image: string | null;
  termsAndConditions: boolean;
  termsAcceptedAt: Date | null;
  username: string | null;
  role: string | null;
  // better-auth admin plugin fields.
  banned: boolean | null;
  banReason: string | null;
  banExpires: Date | null;
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

/** Scalar fields of the Prisma `Account` model (`accounts: true`). better-auth shape. */
export type AccountRecord = {
  id: string;
  userId: string;
  providerId: string;
  accountId: string;
  accessToken: string | null;
  refreshToken: string | null;
  idToken: string | null;
  accessTokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
  scope: string | null;
  password: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Scalar fields of the Prisma `Session` model (`sessions: true`). better-auth shape. */
export type SessionRecord = {
  id: string;
  token: string;
  userId: string;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  impersonatedBy: string | null;
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
  emailVerified?: boolean;
  termsAcceptedAt?: Date | null;
  image?: string | null;
  username?: string | null;
  role?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
}

/**
 * Writable user profile fields accepted by the repository's `updateProfile`
 * method. Mirrors the subset of Prisma's `UserUpdateInput` the profile form
 * writes.
 */
export interface UpdateUserProfileData {
  name: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  allowSmsNotifications?: boolean;
}
