'use server';

import 'server-only';
import { auth } from '../../../../auth';
import { setUnknownError } from '@/app/lib/utils/auth/auth-utils';
import getActionState from '@/app/lib/utils/auth/get-action-state';
import changeUsernameSchema from '@/app/lib/validation/change-username-schema';
import { prisma } from '../prisma';
import { Prisma } from '@prisma/client';
import { CustomPrismaAdapter } from '@/app/lib/prisma-adapter';
import type { FormState } from '../types/form-state';
import { AdapterUser } from 'next-auth/adapters';

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
      await adapter.updateUser!({
        id,
        username,
      } as Pick<AdapterUser, 'username' | 'id'>);

      formState.success = true;
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
      } else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicateKeyError = error as Prisma.PrismaClientKnownRequestError;

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
    } finally {
      if (!formState.success && formState.errors && Object.keys(formState.errors).length > 0) {
        setUnknownError(formState);
      }
    }
  }

  if (formState.success && formState.fields) {
    return formState;
  }

  setUnknownError(formState);

  return formState;
};
