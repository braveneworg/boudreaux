'use server';

import 'server-only';
import getActionState from '@/lib/utils/auth/get-action-state';
import { setUnknownError } from '@/lib/utils/auth/auth-utils';
import signupSchema from '@/lib/validation/signup-schema';
import { type AdapterUser } from "@auth/core/adapters"
import { redirect } from 'next/navigation';
import { generateUsername } from 'unique-username-generator';
import { signIn } from '../../../../auth';
import type { FormState } from '../types/form-state';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '../prisma';
import { Prisma } from '@prisma/client';
import { CustomPrismaAdapter } from '@/lib/prisma-adapter';

interface UserData {
  email: string;
  termsAndConditions: boolean;
}

export const signupAction = async (_initialState: FormState, payload: FormData) => {
  const permittedFieldNames = [
    'email',
    'termsAndConditions',
    'username',
  ];
  const { formState, parsed } = getActionState(payload, permittedFieldNames, signupSchema);

  if (parsed.success) {
    const adapter = CustomPrismaAdapter(prisma);

    try {
      const { email } = formState.fields;

      // TODO: Create user with username and other fields as neededs
      console.log(`36: signup-action > parsed.data >>>`, parsed.data);
      await adapter.createUser!({ ...parsed.data, username: generateUsername('', 4) } as unknown as AdapterUser);
      console.log(`33: signup-action > label >>>`, 'about to signin');
      // Redirect happens below because next throws an error if you redirect inside a try/catch
      // The property redirectTo is responsible for the magic link callback URL
      await signIn('nodemailer', { email, redirect: false, redirectTo: '/' });
      console.log(`37: signup-action > label >>>`, 'signin complete');
      formState.success = true;
    } catch (error: unknown) {
      console.log(`39: signup-action > error >>>`, error);
      formState.success = false;

      if (error instanceof Error && error.name === 'PrismaServerError' && (error as PrismaServerError).code === 11000) {
        const duplicateKeyError = error as Prisma.PrismaClientKnownRequestError;
        if (duplicateKeyError?.message.includes('email_1')) {
          if (!Array.isArray(formState.errors.email)) {
            formState.errors.email = [];
          }
          setUnknownError(formState); // An account already exists with this email address, but don't tell user
        } else {
          setUnknownError(formState);
        }
      } else {
        setUnknownError(formState);
      }
    } finally {
      if (!formState.success && Object.keys(formState.errors).length > 0) {
        setUnknownError(formState);
      }
    }
  }

  if (formState.success) {
    return redirect(encodeURI(`/success?email=${formState.fields.email}`));
  }

  return formState;
};
