/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import Link from 'next/link';

const SuccessContainer = () => (
  <>
    <h1>Success! 🎉</h1>
    <p>
      Your username has been successfully changed.{' '}
      <Link href="/profile">Return to your profile</Link> or <Link href="/">the home view</Link>.
    </p>
  </>
);

export default SuccessContainer;
