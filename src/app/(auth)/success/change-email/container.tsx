/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import Link from 'next/link';

const SuccessContainer = ({ email }: { email: string }) => (
  <>
    <h1>Success! 🎉</h1>
    <p>
      You have successfully changed your email address. You have also been signed out.{' '}
      <Link href="/signin">Sign in again</Link> using your new email address:
      <strong>{email}</strong>.
    </p>
  </>
);

export default SuccessContainer;
