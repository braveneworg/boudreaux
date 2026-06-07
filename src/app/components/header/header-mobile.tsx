/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Image from 'next/image';

import { HamburgerMenu } from '@/ui/hamburger-menu';

import { Logo } from './logo';

/**
 * Mobile / tablet header chrome (below `xl`). Hidden at `xl` via the wrapper's
 * `contents` ↔ `hidden` toggle so the desktop chrome takes over. Its images
 * lazy-load so they aren't fetched on desktop, where this branch is hidden.
 */
const HeaderMobile = () => (
  <div className="contents xl:hidden">
    <Logo isMobile priority={false} />
    <Image
      alt="Fake Four Inc. Words"
      className="relative right-0.5 h-auto w-50.5"
      src="/media/fake-four-inc-words-sans-hand.webp"
      width={222}
      height={40}
    />
    <HamburgerMenu />
  </div>
);

export { HeaderMobile };
