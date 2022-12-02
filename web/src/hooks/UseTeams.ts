import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {IAvatar} from 'src/resources/OrganizationResource';
import {
  createNewTeamForNamespace,
  fetchTeamsForNamespace,
} from 'src/resources/TeamResources';

interface ITeams {
  name: string;
  description: string;
  role: string;
  avatar: IAvatar;
  can_view: boolean;
  repo_count: number;
  member_count: number;
  is_synced: boolean;
}

export function useCreateTeam(namespace) {
  const queryClient = useQueryClient();

  const createTeamMutator = useMutation(
    async ({teamName, description}: createNewTeamForNamespaceParams) => {
      return createNewTeamForNamespace(namespace, teamName, description);
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['organization', namespace, 'teams']);
      },
    },
  );

  return {
    createNewTeamHook: async (params: createNewTeamForNamespaceParams) =>
      createTeamMutator.mutate(params),
  };
}

interface createNewTeamForNamespaceParams {
  teamName: string;
  description: string;
}

export function useFetchTeams(orgName: string) {
  const {data, isLoading, isPlaceholderData, error} = useQuery(
    ['teams'],
    ({signal}) => fetchTeamsForNamespace(orgName, signal),
    {
      placeholderData: {},
    },
  );

  const teams: ITeams[] = Object.values(data);

  return {
    error,
    loading: isLoading,
    teams,
  };
}
