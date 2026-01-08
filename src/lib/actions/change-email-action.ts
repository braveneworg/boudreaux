'use server';

import 'server-only';
import { redirect } from 'next/navigation';

import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

import { CustomPrismaAdapter } from '@/lib/prisma-adapter';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { setUnknownError } from '@/lib/utils/auth/auth-utils';
import getActionState from '@/lib/utils/auth/get-action-state';
import changeEmailSchema from '@/lib/validation/change-email-schema';

import { auth, signOut } from '../../../auth';
import { prisma } from '@/lib/prisma';

import type { FormState } from '../types/form-state';
import type { AdapterUser } from 'next-auth/adapters';

export const changeEmailAction = async (
  _initialState: FormState,
  payload: FormData
): Promise<FormState> => {
  const permittedFieldNames = ['email', 'confirmEmail', 'previousEmail'];
  const { formState, parsed } = getActionState(payload, permittedFieldNames, changeEmailSchema);

  if (parsed.success) {
    try {
      // Get current user session
      const session = await auth();

      if (!session?.user?.id) {
        formState.success = false;
        if (!formState.errors) {
          formState.errors = {};
        }
        formState.errors.general = ['You must be logged in to change your email'];
        return formState;
      }

      // Use the current email from session as previousEmail if not provided
      const previousEmail = parsed.data.previousEmail || session.user.email || '';

      const adapter = CustomPrismaAdapter(prisma);

      formState.hasTimeout = false;

      await adapter.updateUser!({
        id: session.user.id,
        email: parsed.data.email,
        previousEmail,
      } as Pick<AdapterUser, 'email' | 'id'> & { previousEmail: string });

      // Log email change for security audit
      await logSecurityEvent({
        event: 'user.email.changed',
        userId: session.user.id,
        metadata: {
          previousEmail,
          newEmail: parsed.data.email,
        },
      });

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
      } else if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicateKeyError = error as PrismaClientKnownRequestError;

        if (duplicateKeyError?.meta?.target === 'User_email_key') {
          if (!formState.errors) {
            formState.errors = {};
          }
          formState.errors.email = ['Email address is already in use'];
        } else {
          setUnknownError(formState);
        }
      } else {
        setUnknownError(formState);
      }
    }
  }

  if (formState.success) {
    // Sign the user out to force re-authentication with new email
    await signOut({ redirect: false }); // User is redirected

    return redirect(
      `/success/change-email?email=${encodeURIComponent(formState.fields!.email as string)}`
    );
  }

  return formState;
};
