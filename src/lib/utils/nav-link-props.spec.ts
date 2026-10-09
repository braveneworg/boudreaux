/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { getNavLinkProps } from './nav-link-props';

describe('getNavLinkProps', () => {
  it('opens an external item in a new tab with rel hardening', () => {
    expect(getNavLinkProps({ href: 'https://fakefourshirts.com/', isExternal: true }, '/')).toEqual(
      { target: '_blank', rel: 'noopener noreferrer' }
    );
  });

  it('never marks an external item as the current page', () => {
    expect(
      getNavLinkProps({ href: 'https://fakefourshirts.com/', isExternal: true }, '/')
    ).not.toHaveProperty('aria-current');
  });

  it('marks an internal item active on its own route with the prefetch boost', () => {
    expect(getNavLinkProps({ href: '/tours' }, '/tours/123')).toEqual({
      'aria-current': 'page',
      unstable_dynamicOnHover: true,
    });
  });

  it('leaves an internal item unmarked on another route', () => {
    expect(getNavLinkProps({ href: '/tours' }, '/about')).toEqual({
      'aria-current': undefined,
      unstable_dynamicOnHover: true,
    });
  });
});
