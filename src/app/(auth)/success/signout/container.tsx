/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import Link from 'next/link';

const SuccessContainer = () => (
  <>
    <h1>Success! 🎉</h1>
    <p>
      You have been successfully signed out. Please close your browser to protect your privacy.{' '}
      <Link href="/signin">Return to signin.</Link>
    </p>
  </>
);

export default SuccessContainer;
