import { useQuery } from '@tanstack/react-query';

const fetchTracks = async () => {
  const response = await fetch('/api/tracks');
  if (!response.ok) {
    throw Error('Failed to fetch tracks');
  }
  return response.json();
};

const useTracksQuery = () => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: ['tracksData'],
    queryFn: fetchTracks,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return { isPending, error, data, refetch };
};

export default useTracksQuery;
