/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import Image from 'next/image';
import Link from 'next/link';

interface LogoProps {
  isMobile: boolean;
  // The header renders two Logos (mobile + desktop) and shows one per viewport.
  // The off-screen one should lazy-load (`priority={false}`) so its image isn't
  // fetched on the viewport that hides it — e.g. the detailed desktop webp must
  // not download on phones.
  priority?: boolean;
}

export const Logo = ({ isMobile, priority = true }: Readonly<LogoProps>) => {
  return (
    // Home is force-dynamic, so default prefetch only grabs its shell; the
    // hover/touch boost upgrades to a full data prefetch on intent.
    <Link href="/" className="shrink-0 no-underline" unstable_dynamicOnHover>
      <Image
        alt="Fake Four Inc. Hand Logo"
        className="xl:shadow-zine-ink mt-px ml-3 block size-10 rounded-full bg-zinc-50 xl:absolute xl:top-4 xl:left-8 xl:size-24"
        height={48}
        priority={priority}
        unoptimized
        src={
          isMobile
            ? '/media/fake-four-inc-black-hand-logo.svg'
            : '/media/ffinc-black-hand-sans-words-stardust.webp'
        }
        width={48}
      />
    </Link>
  );
};
