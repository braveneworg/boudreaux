/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import Link from 'next/link';

import { ImageHeading } from '@/components/ui/image-heading';

export const SuccessContainer = ({ email }: { email: string }) => (
  <>
    <ImageHeading src="/media/headings/SUCCESS.webp" alt="success" imageHeight={480} priority />
    <p>
      You have successfully changed your email address. You have also been signed out.{' '}
      <Link href="/signin">Sign in again</Link> using your new email address:
      <strong>{email}</strong>.
    </p>
  </>
);
