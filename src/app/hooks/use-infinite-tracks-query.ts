import { useInfiniteQuery } from '@tanstack/react-query';

const PAGE_SIZE = 20;

interface TracksResponse {
  tracks: Array<Record<string, unknown>>;
  count: number;
  totalCount: number;
  hasMore: boolean;
}

const fetchTracksPage = async ({
  pageParam = 0,
}: {
  pageParam?: number;
}): Promise<TracksResponse> => {
  const response = await fetch(`/api/tracks?skip=${pageParam}&take=${PAGE_SIZE}`);
  if (!response.ok) {
    throw new Error('Failed to fetch tracks');
  }
  return response.json();
};

const useInfiniteTracksQuery = () => {
  const query = useInfiniteQuery({
    queryKey: ['tracksDataInfinite'],
    queryFn: fetchTracksPage,
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasMore) return undefined;
      return allPages.length * PAGE_SIZE;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Flatten all pages into a single array and deduplicate by ID
  // Deduplication is needed because pagination offsets can shift when new tracks are added
  const allTracks =
    query.data?.pages
      .flatMap((page) => page.tracks)
      .reduce<{ seen: Set<string>; tracks: Array<Record<string, unknown>> }>(
        (acc, track) => {
          const trackWithId = track as { id: string };
          if (!acc.seen.has(trackWithId.id)) {
            acc.seen.add(trackWithId.id);
            acc.tracks.push(track);
          }
          return acc;
        },
        { seen: new Set<string>(), tracks: [] as Array<Record<string, unknown>> }
      ).tracks ?? [];
  const totalCount = query.data?.pages[0]?.totalCount ?? 0;

  return {
    ...query,
    tracks: allTracks,
    totalCount,
  };
};

export default useInfiniteTracksQuery;
