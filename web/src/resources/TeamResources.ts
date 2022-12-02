import {AxiosResponse} from 'axios';
import axios from 'src/libs/axios';
import {assertHttpCode} from './ErrorHandling';

export async function createNewTeamForNamespace(
  namespace: string,
  teamName: string,
  description: string,
) {
  const createTeamUrl = `/api/v1/organization/${namespace}/team/${teamName}`;
  const payload = {name: teamName, role: 'member', description: description};
  const response: AxiosResponse = await axios.put(createTeamUrl, payload);
  assertHttpCode(response.status, 200);
  return response.data?.name;
}

export async function updateTeamForRobot(
  namespace: string,
  teamName: string,
  robotName: string,
) {
  const robotNameWithOrg = `${namespace}+${robotName}`;
  const createTeamUrl = `/api/v1/organization/${namespace}/team/${teamName}/members/${robotNameWithOrg}`;
  const response: AxiosResponse = await axios.put(createTeamUrl, {});
  assertHttpCode(response.status, 200);
  return response.data?.name;
}



export async function fetchTeamsForNamespace(
  org: string,
  signal?: AbortSignal,
) {
  const teamsForOrgUrl = `/api/v1/organization/${org}`;
  const teamsResponse = await axios.get(teamsForOrgUrl, {signal});
  assertHttpCode(teamsResponse.status, 200);
  return teamsResponse.data?.teams;
}

