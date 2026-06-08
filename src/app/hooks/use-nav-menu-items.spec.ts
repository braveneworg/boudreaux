/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';

import { useNavMenuItems } from './use-nav-menu-items';

const mockUseSession = vi.hoisted(() => vi.fn());

vi.mock('next-auth/react', () => ({
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

    it('pairs each item color with a matching visited variant', () => {
      const { result } = renderHook(() => useNavMenuItems());

      const home = result.current.find((item) => item.name === 'Home');
      expect(home?.color).toBe('text-menu-item-yellow-400 visited:text-menu-item-yellow-400');
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
  });
});
