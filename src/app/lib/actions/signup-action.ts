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
import { prisma } from '../prisma';
import { Prisma } from '@prisma/client';
import { CustomPrismaAdapter } from '@/lib/prisma-adapter';

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

      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicateKeyError = error as Prisma.PrismaClientKnownRequestError;
        console.log(`46: signup-action > duplicateKeyError >>>`, duplicateKeyError);
        if (duplicateKeyError?.meta?.target === 'User_email_key') {
          if (!formState.errors) {
            formState.errors = {};
          }

          console.log(`52: signup-action > label >>>`, 'its an email');

          formState.errors.email = ['Account with this email already exists'];
        } else {
          setUnknownError(formState);
        }
      } else {
        setUnknownError(formState);
      }
    }
  }

  if (formState.success) {
    return redirect(encodeURI(`/success?email=${formState.fields.email}`));
  }

  return formState;
};
