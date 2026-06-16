/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { prisma } from '@/lib/prisma';

import type { Prisma, User } from '@prisma/client';

/**
 * Data-access layer for the User model.
 * Centralises every `prisma.user.*` call used by the service layer.
 * Methods return RAW Prisma results — business logic, validation and
 * error handling stay in the calling services.
 */
export class UserRepository {
  /** Look up a full user record by email. Returns `null` when not found. */
  static async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  }

  /** Look up a user by email, selecting only their id. */
  static async findIdByEmail(email: string): Promise<{ id: string } | null> {
    return prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
  }

  /** Look up a user by id, selecting only their email. */
  static async findEmailById(id: string): Promise<{ email: string | null } | null> {
    return prisma.user.findUnique({
      where: { id },
      select: { email: true },
    });
  }

  /** Look up a user by username, selecting id, username and email. */
  static async findByUsername(
    username: string
  ): Promise<{ id: string; username: string | null; email: string | null } | null> {
    return prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true, email: true },
    });
  }

  /** Create a user with the supplied data. */
  static async create(data: Prisma.UserCreateInput): Promise<User> {
    return prisma.user.create({ data });
  }

  /** Create a guest user, returning only the new id. */
  static async createGuest(data: Prisma.UserCreateInput): Promise<{ id: string }> {
    return prisma.user.create({ data, select: { id: true } });
  }

  /** Update a user's username. */
  static async updateUsername(id: string, username: string): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: { username },
    });
  }

  /**
   * Case-insensitive username prefix search, excluding the caller.
   * Capped at `take` rows and ordered by username ascending.
   */
  static async searchByUsernamePrefix(
    prefix: string,
    excludeUserId: string,
    take: number
  ): Promise<Array<{ id: string; username: string | null }>> {
    return prisma.user.findMany({
      where: {
        username: { startsWith: prefix, mode: 'insensitive' },
        NOT: { id: excludeUserId },
      },
      select: { id: true, username: true },
      take,
      orderBy: { username: 'asc' },
    });
  }

  /**
   * Resolve a list of usernames to user rows (case-insensitive),
   * excluding the author so self-mentions don't match.
   */
  static async findByUsernames(
    usernames: string[],
    excludeUserId: string
  ): Promise<Array<{ id: string; username: string | null; email: string | null }>> {
    return prisma.user.findMany({
      where: {
        username: { in: usernames, mode: 'insensitive' },
        NOT: { id: excludeUserId },
      },
      select: { id: true, username: true, email: true },
    });
  }

  /** Fetch every admin user with the fields needed for notification fan-out. */
  static async findAdmins(): Promise<
    Array<{
      id: string;
      email: string;
      username: string | null;
      phone: string | null;
      allowSmsNotifications: boolean | null;
    }>
  > {
    return prisma.user.findMany({
      where: { role: 'admin' },
      select: {
        id: true,
        email: true,
        username: true,
        phone: true,
        allowSmsNotifications: true,
      },
    });
  }
}
