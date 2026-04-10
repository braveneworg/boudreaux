/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';

interface CollectionResponse {
  purchases: Array<{
    id: string;
    amountPaid: number;
    currency: string;
    purchasedAt: string;
    release: {
      id: string;
      title: string;
      coverArt: string;
      images: Array<{
        id: string;
        src: string | null;
        altText: string | null;
        sortOrder: number;
      }>;
      artistReleases: Array<{
        artist: {
          id: string;
          firstName: string;
          surname: string;
          displayName: string | null;
        };
      }>;
      digitalFormats: Array<{
        formatType: string;
        files: Array<{ fileName: string }>;
      }>;
      releaseDownloads: Array<{
        downloadCount: number;
      }>;
    };
  }>;
  count: number;
  isAdmin: boolean;
}

const fetchCollection = async (): Promise<CollectionResponse> => {
  const response = await fetch('/api/user/collection');
  if (!response.ok) {
    if (response.status === 401) {
      throw Error('Unauthorized');
    }
    throw Error('Failed to fetch collection');
  }
  return response.json() as Promise<CollectionResponse>;
};

export const useCollectionQuery = () => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.collection.list(),
    queryFn: fetchCollection,
  });

  return { isPending, error, data, refetch };
};
