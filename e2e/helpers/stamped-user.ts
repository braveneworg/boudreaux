/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { E2E_AUTH_SECRET } from './auth-constants';
import { createStorageState } from './auth-helpers';
import { routeCdn } from './cdn-mock';

import type { Browser, BrowserContext } from '@playwright/test';
import type { PrismaClient } from '@prisma/client';

const SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000;

type StorageState = Awaited<ReturnType<typeof createStorageState>>;

interface StampedUserInput {
  /** Unique per run (`randomUUID` stamp): the username and the email's local part. */
  handle: string;
  name: string;
}

interface StampedUser {
  id: string;
  username: string;
  storageState: StorageState;
}

/**
 * Create a signed-in user that belongs to one spec run. A spec that changes a
 * user's state other specs read (chat access, download caps) uses one of these
 * instead of the shared seeded users, whose state every worker sees. The caller
 * deletes the rows it created, by id, in `afterAll`.
 */
const createStampedUser = async (
  prisma: PrismaClient,
  { handle, name }: StampedUserInput
): Promise<StampedUser> => {
  const { id } = await prisma.user.create({
    data: {
      email: `${handle}@example.invalid`,
      name,
      username: handle,
      role: 'user',
      emailVerified: true,
      banned: false,
      termsAndConditions: true,
      termsAcceptedAt: new Date(),
    },
    select: { id: true },
  });
  const token = `e2e-stamped-${handle}`;
  await prisma.session.create({
    data: { token, userId: id, expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS) },
  });
  return { id, username: handle, storageState: await createStorageState(token, E2E_AUTH_SECRET) };
};

/** Open a browser context signed in as a stamped user, with the CDN answered locally. */
const newStampedUserContext = async (
  browser: Browser,
  { storageState }: StampedUser
): Promise<BrowserContext> => {
  const context = await browser.newContext({ storageState });
  await routeCdn(context);
  return context;
};

export { createStampedUser, newStampedUserContext };
export type { StampedUser };
