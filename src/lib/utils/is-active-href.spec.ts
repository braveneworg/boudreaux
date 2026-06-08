/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { isActiveHref } from './is-active-href';

describe('isActiveHref', () => {
  it('matches the root only on an exact path', () => {
    expect(isActiveHref('/', '/')).toBe(true);
  });

  it('does not treat the root as active on a sub-route', () => {
    expect(isActiveHref('/', '/releases')).toBe(false);
  });

  it('matches a non-root href exactly', () => {
    expect(isActiveHref('/releases', '/releases')).toBe(true);
  });

  it('stays active on a sub-route of a non-root href', () => {
    expect(isActiveHref('/releases', '/releases/123')).toBe(true);
  });

  it('does not match a different href that shares a prefix segment', () => {
    expect(isActiveHref('/release', '/releases')).toBe(false);
  });
});
