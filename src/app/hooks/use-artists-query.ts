import { useQuery } from '@tanstack/react-query';

const fetchArtists = async () => {
  const response = await fetch('/api/artists');
  if (!response.ok) {
    throw Error('Failed to fetch artists');
  }
  return response.json();
};

const useArtistsQuery = () => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: ['artistsData'],
    queryFn: fetchArtists,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return { isPending, error, data, refetch };
};

export default useArtistsQuery;
