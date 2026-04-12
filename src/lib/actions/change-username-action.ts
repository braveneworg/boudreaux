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

  // Handle Zod validation errors
  if (!parsed.success) {
    if (!formState.errors) {
      formState.errors = {};
    }

    // Extract field-level errors from Zod
    for (const [field, error] of Object.entries(parsed.error.flatten().fieldErrors)) {
      formState.errors[field] = error as string[];
    }

    // If there are general errors, add them as well
    const generalErrors = parsed.error.flatten().formErrors;
    if (generalErrors && generalErrors.length > 0) {
      formState.errors.general = generalErrors;
    }

    return formState;
  }

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

      // Detailed error logging for debugging
      const errorDetails = {
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorCode: error instanceof PrismaClientKnownRequestError ? error.code : undefined,
        errorStack:
          process.env.NODE_ENV !== 'production' && error instanceof Error ? error.stack : undefined,
      };
      console.error('[changeUsernameAction] Error updating username:', errorDetails);

      // Initialize errors object if it doesn't exist
      if (!formState.errors) {
        formState.errors = {};
      }

      // Check for MongoDB timeout errors
      if (
        error instanceof Error &&
        (error.message.includes('ETIMEOUT') ||
          error.message.includes('timeout') ||
          error.message.includes('timed out') ||
          ('code' in error && error.code === 'ETIMEOUT'))
      ) {
        formState.hasTimeout = true;
        formState.errors.general = ['Connection timed out. Please try again.'];
      } else if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
        // Handle duplicate key error
        const duplicateKeyError = error as PrismaClientKnownRequestError;

        if (duplicateKeyError?.meta?.target === 'User_username_key') {
          formState.errors.username = ['Username is already taken.'];
        } else {
          // Other unique constraint violations
          const targetField = Array.isArray(duplicateKeyError?.meta?.target)
            ? duplicateKeyError.meta.target.join(', ')
            : String(duplicateKeyError?.meta?.target);
          formState.errors.general = [
            `This ${targetField} is already in use. Please choose a different one.`,
          ];
        }
      } else if (
        error instanceof Error &&
        error.message === 'You must be logged in to change your username'
      ) {
        // Specific error message for authentication issues
        formState.errors.general = [error.message];
      } else if (error instanceof PrismaClientKnownRequestError) {
        // Handle other known Prisma errors with more context
        const prismaError = error as PrismaClientKnownRequestError;
        console.error('[changeUsernameAction] Prisma error code:', prismaError.code);

        // Provide more specific error messages for different Prisma error codes
        switch (prismaError.code) {
          case 'P2025':
            formState.errors.general = ['User not found. Please refresh and try again.'];
            break;
          case 'P2023':
            formState.errors.general = [
              'There was a data validation issue. Please refresh and try again.',
            ];
            break;
          default:
            formState.errors.general = [
              'A database error occurred. Please try again or contact support.',
            ];
        }
      } else if (error instanceof Error) {
        // Handle general JavaScript errors
        console.error('[changeUsernameAction] JavaScript error:', error.message);
        formState.errors.general = [
          'Failed to update username. Please try again or contact support.',
        ];
      } else {
        // Unknown error type
        console.error('[changeUsernameAction] Unknown error type:', error);
        formState.errors.general = [
          'An unexpected error occurred. Please try again or contact support.',
        ];
      }
    }
  }

  return formState;
};
