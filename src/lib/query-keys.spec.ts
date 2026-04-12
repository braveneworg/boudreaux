/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { queryKeys } from './query-keys';

describe('queryKeys', () => {
  describe('banners', () => {
    it('should return all key', () => {
      expect(queryKeys.banners.all).toEqual(['banners']);
    });

    it('should return active key extending all', () => {
      const key = queryKeys.banners.active();
      expect(key).toEqual(['banners', 'active']);
      expect(key[0]).toBe(queryKeys.banners.all[0]);
    });
  });

  describe('releases', () => {
    it('should return all key', () => {
      expect(queryKeys.releases.all).toEqual(['releases']);
    });

    it('should return list key extending all', () => {
      const listKey = queryKeys.releases.list();
      expect(listKey).toEqual(['releases', 'list']);
      expect(listKey[0]).toBe(queryKeys.releases.all[0]);
    });

    it('should return published key extending all', () => {
      const key = queryKeys.releases.published();
      expect(key).toEqual(['releases', 'published']);
    });

    it('should return detail key with id', () => {
      const key = queryKeys.releases.detail('r-123');
      expect(key).toEqual(['releases', 'detail', 'r-123']);
    });

    it('should return userStatus key with id', () => {
      const key = queryKeys.releases.userStatus('r-123');
      expect(key).toEqual(['releases', 'userStatus', 'r-123']);
    });

    it('should return related key with id and no artistId', () => {
      const key = queryKeys.releases.related('r-123');
      expect(key).toEqual(['releases', 'related', 'r-123', '']);
    });

    it('should return related key with id and artistId', () => {
      const key = queryKeys.releases.related('r-123', 'a-456');
      expect(key).toEqual(['releases', 'related', 'r-123', 'a-456']);
    });

    it('should return digitalFormats key with id', () => {
      const key = queryKeys.releases.digitalFormats('r-123');
      expect(key).toEqual(['releases', 'digitalFormats', 'r-123']);
    });

    it('should return filteredList key with all params', () => {
      const key = queryKeys.releases.filteredList({
        search: 'test',
        artistIds: ['a-1', 'a-2'],
        take: 50,
      });
      expect(key).toEqual(['releases', 'filteredList', 'test', 'a-1,a-2', '50']);
    });

    it('should return filteredList key with empty defaults', () => {
      const key = queryKeys.releases.filteredList({});
      expect(key).toEqual(['releases', 'filteredList', '', '', '']);
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

    it('should return bySlug key with slug', () => {
      const key = queryKeys.artists.bySlug('test-artist');
      expect(key).toEqual(['artists', 'bySlug', 'test-artist']);
    });

    it('should return search key with query', () => {
      const key = queryKeys.artists.search('rock');
      expect(key).toEqual(['artists', 'search', 'rock']);
    });

    it('should return filteredList key with params', () => {
      const key = queryKeys.artists.filteredList({ search: 'jazz', take: 5 });
      expect(key).toEqual(['artists', 'filteredList', 'jazz', '5']);
    });

    it('should return filteredList key with empty defaults', () => {
      const key = queryKeys.artists.filteredList({});
      expect(key).toEqual(['artists', 'filteredList', '', '']);
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

    it('should return active key extending all', () => {
      const key = queryKeys.featuredArtists.active();
      expect(key).toEqual(['featuredArtists', 'active']);
    });
  });

  describe('collection', () => {
    it('should return all key', () => {
      expect(queryKeys.collection.all).toEqual(['collection']);
    });

    it('should return list key extending all', () => {
      const key = queryKeys.collection.list();
      expect(key).toEqual(['collection', 'list']);
      expect(key[0]).toBe(queryKeys.collection.all[0]);
    });
  });

  describe('tours', () => {
    it('should return all key', () => {
      expect(queryKeys.tours.all).toEqual(['tours']);
    });

    it('should return list key extending all', () => {
      const key = queryKeys.tours.list();
      expect(key).toEqual(['tours', 'list']);
      expect(key[0]).toBe(queryKeys.tours.all[0]);
    });

    it('should return detail key with id', () => {
      const key = queryKeys.tours.detail('t-456');
      expect(key).toEqual(['tours', 'detail', 't-456']);
    });

    it('should return dates key with tourId', () => {
      const key = queryKeys.tours.dates('t-789');
      expect(key).toEqual(['tours', 'dates', 't-789']);
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

  describe('notifications', () => {
    it('should return all key', () => {
      expect(queryKeys.notifications.all).toEqual(['notifications']);
    });

    it('should return search key with query', () => {
      const key = queryKeys.notifications.search('test');
      expect(key).toEqual(['notifications', 'search', 'test']);
    });
  });

  describe('cdn', () => {
    it('should return all key', () => {
      expect(queryKeys.cdn.all).toEqual(['cdn']);
    });

    it('should return status key', () => {
      const key = queryKeys.cdn.status();
      expect(key).toEqual(['cdn', 'status']);
    });
  });

  describe('downloadAnalytics', () => {
    it('should return all key', () => {
      expect(queryKeys.downloadAnalytics.all).toEqual(['downloadAnalytics']);
    });

    it('should return byRelease key', () => {
      const key = queryKeys.downloadAnalytics.byRelease('r-123', '30d');
      expect(key).toEqual(['downloadAnalytics', 'r-123', '30d']);
    });
  });

  describe('downloadQuota', () => {
    it('should return all key', () => {
      expect(queryKeys.downloadQuota.all).toEqual(['downloadQuota']);
    });

    it('should return user key', () => {
      const key = queryKeys.downloadQuota.user();
      expect(key).toEqual(['downloadQuota', 'user']);
    });
  });

  describe('health', () => {
    it('should return all key', () => {
      expect(queryKeys.health.all).toEqual(['health']);
    });

    it('should return status key', () => {
      const key = queryKeys.health.status();
      expect(key).toEqual(['health', 'status']);
    });
  });

  describe('venues', () => {
    it('should return all key', () => {
      expect(queryKeys.venues.all).toEqual(['venues']);
    });

    it('should return search key with query', () => {
      const key = queryKeys.venues.search('madison');
      expect(key).toEqual(['venues', 'search', 'madison']);
    });

    it('should return detail key with id', () => {
      const key = queryKeys.venues.detail('v-123');
      expect(key).toEqual(['venues', 'detail', 'v-123']);
    });
  });
});
