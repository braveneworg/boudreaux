/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { LoginVerificationEmailData } from './login-verification-email-html';

export function buildLoginVerificationEmailText(data: LoginVerificationEmailData): string {
  const greeting = data.isNewUser ? 'Welcome to Fake Four Inc.!' : 'Welcome back!';

  const message = data.isNewUser
    ? "We're glad you're here. Use the link below to sign in and start exploring our releases."
    : 'Use the link below to sign in to your account.';

  return `Fake Four Inc. — Sign-In Request

${greeting}

${message}

Signing in as: ${data.email}

Sign In:
${data.url}

This link expires in 24 hours and can only be used once.

If you did not request this email, you can safely ignore it.

— Fake Four Inc.
fakefourrecords.com`;
}
