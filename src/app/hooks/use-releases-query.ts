import { useQuery } from '@tanstack/react-query';

const fetchReleases = async () => {
  const response = await fetch('/api/releases');
  if (!response.ok) {
    throw Error('Failed to fetch releases');
  }
  return response.json();
};

const useReleasesQuery = () => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: ['releasesData'],
    queryFn: fetchReleases,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return { isPending, error, data, refetch };
};

export default useReleasesQuery;
