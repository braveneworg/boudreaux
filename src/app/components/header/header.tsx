/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { HeaderBackdrop } from './header-backdrop';
import { HeaderContainer } from './header-container';
import { HeaderContent } from './header-content';

const Header = () => {
  return (
    <HeaderContainer>
      <HeaderBackdrop />
      <HeaderContent />
    </HeaderContainer>
  );
};

export { Header };
