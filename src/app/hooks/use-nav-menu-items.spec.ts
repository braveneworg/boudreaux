/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';

import { useNavMenuItems } from './use-nav-menu-items';

const mockUseSession = vi.hoisted(() => vi.fn());

vi.mock('@/app/hooks/use-session', () => ({
  useSession: mockUseSession,
}));

describe('useNavMenuItems', () => {
  describe('unauthenticated', () => {
    beforeEach(() => {
      mockUseSession.mockReturnValue({ status: 'unauthenticated' });
    });

    it('returns the nine public items in order', () => {
      const { result } = renderHook(() => useNavMenuItems());

      expect(result.current.map((item) => item.name)).toEqual([
        'Home',
        'Artists',
        'Releases',
        'Videos',
        'Tours',
        'Merch',
        'Playlists',
        'About',
        'Contact Us',
      ]);
    });

    it('does not include My Collection', () => {
      const { result } = renderHook(() => useNavMenuItems());

      expect(result.current.some((item) => item.name === 'My Collection')).toBe(false);
    });

    it('gives Videos a separator bullet when logged out', () => {
      const { result } = renderHook(() => useNavMenuItems());

      const videos = result.current.find((item) => item.name === 'Videos');
      expect(videos?.hasBullet).toBe(true);
    });

    it('omits the Merch separator bullet when logged out', () => {
      const { result } = renderHook(() => useNavMenuItems());

      const merch = result.current.find((item) => item.name === 'Merch');
      expect(merch?.hasBullet).toBe(false);
    });

    it('scopes the Home color to the active and hover states with a matching hover underline', () => {
      const { result } = renderHook(() => useNavMenuItems());

      const home = result.current.find((item) => item.name === 'Home');
      expect(home?.color).toBe(
        'aria-[current=page]:text-menu-item-yellow-400 hover:text-menu-item-yellow-400 hover:decoration-menu-item-yellow-400'
      );
    });

    it('leaves no item with a base (always-on) text-color utility', () => {
      const { result } = renderHook(() => useNavMenuItems());

      const baseTextColors = result.current.filter((item) =>
        item.color.split(' ').some((cls) => /^text-/.test(cls))
      );
      expect(baseTextColors).toEqual([]);
    });

    it('no longer pairs any item with a visited variant', () => {
      const { result } = renderHook(() => useNavMenuItems());

      const withVisited = result.current.filter((item) => item.color.includes('visited:'));
      expect(withVisited).toEqual([]);
    });

    it('gives every item active and hover text colors plus a hover underline color', () => {
      const { result } = renderHook(() => useNavMenuItems());

      const fullyVariant = result.current.every(
        (item) =>
          item.color.includes('aria-[current=page]:text-') &&
          item.color.includes('hover:text-') &&
          item.color.includes('hover:decoration-')
      );
      expect(fullyVariant).toBe(true);
    });
  });

  describe('authenticated', () => {
    beforeEach(() => {
      mockUseSession.mockReturnValue({ status: 'authenticated' });
    });

    it('inserts My Collection after Releases', () => {
      const { result } = renderHook(() => useNavMenuItems());

      const names = result.current.map((item) => item.name);
      expect(names.indexOf('My Collection')).toBe(names.indexOf('Releases') + 1);
    });

    it('flips the bullets so Merch gains and Videos loses its separator', () => {
      const { result } = renderHook(() => useNavMenuItems());

      const videos = result.current.find((item) => item.name === 'Videos');
      const merch = result.current.find((item) => item.name === 'Merch');
      expect(videos?.hasBullet).toBe(false);
      expect(merch?.hasBullet).toBe(true);
    });

    it('scopes the My Collection color to the active and hover states with matching underline colors', () => {
      const { result } = renderHook(() => useNavMenuItems());

      const collection = result.current.find((item) => item.name === 'My Collection');
      expect(collection?.color).toBe(
        'aria-[current=page]:text-menu-item-green-400 aria-[current=page]:decoration-menu-item-green-400 hover:text-menu-item-green-400 hover:decoration-menu-item-green-400'
      );
    });
  });
});
