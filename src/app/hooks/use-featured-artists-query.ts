import { useQuery } from '@tanstack/react-query';

const fetchFeaturedArtists = async () => {
  const response = await fetch('/api/featured-artists');
  if (!response.ok) {
    throw Error('Failed to fetch featured artists');
  }
  return response.json();
};

const useFeaturedArtistsQuery = () => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: ['featuredArtistsData'],
    queryFn: fetchFeaturedArtists,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return { isPending, error, data, refetch };
};

export default useFeaturedArtistsQuery;
