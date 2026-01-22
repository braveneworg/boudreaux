import { useQuery } from '@tanstack/react-query';

const fetchGroups = async () => {
  const response = await fetch('/api/groups');
  if (!response.ok) {
    throw Error('Failed to fetch groups');
  }
  return response.json();
};

const useGroupsQuery = () => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: ['groupsData'],
    queryFn: fetchGroups,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return { isPending, error, data, refetch };
};

export default useGroupsQuery;
