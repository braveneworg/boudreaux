/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { HeaderDesktop } from './header-desktop';
import { HeaderMobile } from './header-mobile';

/**
 * Foreground content layer of the site header: the responsive logo, wordmark,
 * and navigation chrome. Sits above the decorative HeaderBackdrop.
 */
const HeaderContent = () => {
  return (
    // The header is viewport-responsive, not User-Agent gated: the mobile
    // chrome shows below `xl`, the desktop chrome at `xl`. Both branches are
    // rendered and toggled purely by CSS (`contents` ↔ `hidden`) so the browser
    // picks the right one at paint time — no hydration flash on devices the
    // server misdetects (e.g. an iPhone with Safari's "Request Desktop Website"
    // enabled). The height steps 58px → 122px (`md`, to meet the hamburger
    // sheet) → 128px (`xl`, the desktop header).
    // xl:overflow-visible is load-bearing: the Music/Label nav drawers hang
    // ~206px below this 128px bar, so clipping here hides them (the decorative
    // starfield is clipped on HeaderBackdrop instead, not here).
    <header className="relative z-20 mx-auto flex h-14.5 w-full min-w-0 items-center justify-between overflow-hidden pb-0 pl-0 leading-14.5 md:h-30.5 xl:h-32 xl:max-w-7xl xl:justify-start xl:overflow-visible">
      <HeaderMobile />
      <HeaderDesktop />
    </header>
  );
};

export { HeaderContent };
