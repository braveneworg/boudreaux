/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { queryKeys } from './query-keys';

describe('queryKeys', () => {
  describe('releases', () => {
    it('should return all key', () => {
      expect(queryKeys.releases.all).toEqual(['releases']);
    });

    it('should return list key extending all', () => {
      const listKey = queryKeys.releases.list();
      expect(listKey).toEqual(['releases', 'list']);
      expect(listKey[0]).toBe(queryKeys.releases.all[0]);
    });
  });

  describe('artists', () => {
    it('should return all key', () => {
      expect(queryKeys.artists.all).toEqual(['artists']);
    });

    it('should return list key extending all', () => {
      const listKey = queryKeys.artists.list();
      expect(listKey).toEqual(['artists', 'list']);
      expect(listKey[0]).toBe(queryKeys.artists.all[0]);
    });
  });

  describe('featuredArtists', () => {
    it('should return all key', () => {
      expect(queryKeys.featuredArtists.all).toEqual(['featuredArtists']);
    });

    it('should return list key extending all', () => {
      const listKey = queryKeys.featuredArtists.list();
      expect(listKey).toEqual(['featuredArtists', 'list']);
      expect(listKey[0]).toBe(queryKeys.featuredArtists.all[0]);
    });
  });

  describe('purchaseStatus', () => {
    it('should return bySession key with parameters', () => {
      const key = queryKeys.purchaseStatus.bySession('release-123', 'session-456');
      expect(key).toEqual(['purchaseStatus', 'release-123', 'session-456']);
    });

    it('should return different keys for different parameters', () => {
      const key1 = queryKeys.purchaseStatus.bySession('release-1', 'session-1');
      const key2 = queryKeys.purchaseStatus.bySession('release-2', 'session-2');
      expect(key1).not.toEqual(key2);
    });
  });
});
