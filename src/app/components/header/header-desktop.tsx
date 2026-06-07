/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Image from 'next/image';

import { DesktopAuthMenu } from '../desktop-auth-menu';
import { DesktopMenu } from '../desktop-menu';
import { Logo } from './logo';

/**
 * Desktop header chrome (`xl` and up). Hidden below `xl` via the wrapper's
 * `contents` ↔ `hidden` toggle so the mobile chrome takes over. Its images
 * lazy-load so they aren't fetched on phones, where this branch is hidden.
 */
const HeaderDesktop = () => (
  <div className="hidden xl:contents">
    <Logo isMobile={false} priority={false} />
    <Image
      alt="Fake Four Inc. Words"
      className="absolute top-6 left-1/2 z-40 h-auto w-auto -translate-x-1/2 transform"
      src="/media/fake-four-inc-words-sans-hand.webp"
      width={444}
      height={40}
    />
    <DesktopMenu />
    <DesktopAuthMenu />
  </div>
);

export { HeaderDesktop };
