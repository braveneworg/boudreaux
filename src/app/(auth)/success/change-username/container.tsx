/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import Link from 'next/link';

import { ImageHeading } from '@/components/ui/image-heading';
import { ZinePanel } from '@/components/ui/zine-panel';

export const SuccessContainer = (): React.ReactElement => (
  <ZinePanel accent="kraft">
    <ImageHeading
      src="/media/headings/SUCCESS.webp"
      alt="success"
      imageHeight={480}
      imageClassName="w-full"
      priority
    />
    {/* Copy stays centered at reading width inside the full-width panel */}
    <div className="mx-auto w-full max-w-lg">
      <p>
        Your username has been successfully changed.{' '}
        <Link href="/profile">Return to your profile</Link> or <Link href="/">the home view</Link>.
      </p>
    </div>
  </ZinePanel>
);
