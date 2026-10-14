/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import Image from 'next/image';
import Link from 'next/link';

import { VerticalSeparator } from '@/ui/vertical-separator';

/**
 * The particle texture behind the footer below `xl` — the same file the
 * masthead shows, from the same app-origin path, so the browser fetches it
 * once. As a CSS background it was requested at high priority as soon as the
 * footer was styled, 3000px below a phone's fold, beside the hero banner; as
 * a lazy `<img>` it waits until the footer nears the viewport.
 */
const MOBILE_PARTICLES_SRC = '/media/particles-6.svg';

export const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="relative min-h-23 w-full bg-zinc-950 before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:opacity-90 before:content-[''] xl:border-t-2 xl:border-t-zinc-50 xl:bg-black xl:bg-[url(/media/ffinc-starfield-tile.png)] xl:bg-auto xl:bg-repeat">
      {/* `object-cover` reproduces the old `bg-cover bg-center`; the content
          block below is `relative z-10`, so it still paints above. */}
      <Image
        src={MOBILE_PARTICLES_SRC}
        unoptimized
        alt=""
        aria-hidden="true"
        fill
        sizes="100vw"
        loading="lazy"
        fetchPriority="low"
        className="pointer-events-none absolute inset-0 object-cover xl:hidden"
      />
      <div className="relative z-10 mx-auto mt-2 w-full py-1 xl:max-w-7xl">
        <div className="flex flex-col items-center justify-center gap-0 px-4 md:flex-row md:justify-between md:px-8">
          <div className="flex text-sm text-zinc-50 md:text-base">
            © {currentYear} Fake Four Inc.
            <VerticalSeparator className="mx-3 h-4!" />
            All rights reserved.
          </div>
          <nav className="flex flex-wrap items-center justify-center">
            <Link
              className="px-2 py-1 text-sm text-zinc-50 hover:underline"
              href="/legal/terms-and-conditions"
            >
              Terms and Conditions
            </Link>
            <VerticalSeparator className="h-4!" />
            <Link
              className="px-2 py-1 text-sm text-zinc-50 hover:underline"
              href="/legal/privacy-policy"
            >
              Privacy Policy
            </Link>
            <VerticalSeparator className="h-4!" />
            <Link
              className="px-2 py-1 text-sm text-zinc-50 hover:underline"
              href="/legal/cookies-policy"
            >
              Cookies Policy
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
};
