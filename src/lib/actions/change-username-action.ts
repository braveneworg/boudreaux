/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';

import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

import { prisma } from '@/lib/prisma';
import { CustomPrismaAdapter } from '@/lib/prisma-adapter';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { setUnknownError } from '@/lib/utils/auth/auth-utils';
import { getActionState } from '@/lib/utils/auth/get-action-state';
import changeUsernameSchema from '@/lib/validation/change-username-schema';

import { auth } from '../../../auth';

import type { FormState } from '../types/form-state';
import type { AdapterUser } from 'next-auth/adapters';

export const changeUsernameAction = async (
  _initialState: FormState,
  payload: FormData
): Promise<FormState> => {
  const permittedFieldNames = ['username', 'confirmUsername'];
  const { formState, parsed } = getActionState(payload, permittedFieldNames, changeUsernameSchema);

  if (parsed.success) {
    try {
      // Get current user session
      const session = await auth();

      if (!session?.user?.id) {
        throw Error('You must be logged in to change your username');
      }

      const adapter = CustomPrismaAdapter(prisma);

      formState.hasTimeout = false;

      const { id } = session.user;
      const { username } = parsed.data;
      const previousUsername = session.user.username;

      await adapter.updateUser!({
        id,
        username,
      } as Pick<AdapterUser, 'username' | 'id'>);

      // Log username change for security audit
      await logSecurityEvent({
        event: 'user.username.changed',
        userId: id,
        metadata: {
          previousUsername,
          newUsername: username,
        },
      });

      formState.success = true;

      // Revalidate the profile page to reflect the username change
      revalidatePath('/profile');
    } catch (error: unknown) {
      formState.success = false;
      // Check for MongoDB timeout errors
      if (
        error instanceof Error &&
        (error.message.includes('ETIMEOUT') ||
          error.message.includes('timeout') ||
          error.message.includes('timed out') ||
          ('code' in error && error.code === 'ETIMEOUT'))
      ) {
        formState.hasTimeout = true;
        if (!formState.errors) {
          formState.errors = {};
        }
        formState.errors.general = ['Connection timed out. Please try again.'];
      } else if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicateKeyError = error as PrismaClientKnownRequestError;

        if (duplicateKeyError?.meta?.target === 'User_username_key') {
          if (!formState.errors) {
            formState.errors = {};
          }
          formState.errors.username = ['Username is already taken.'];
        } else {
          setUnknownError(formState);
        }
      } else {
        setUnknownError(formState);
      }
    }
  }

  return formState;
};
