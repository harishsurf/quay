import {
  TableComposable,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@patternfly/react-table';
import TeamsViewToolbar from './TeamsViewToolbar';
import {Link, useSearchParams} from 'react-router-dom';
import {
  Dropdown,
  DropdownItem,
  DropdownToggle,
  PageSection,
  PageSectionVariants,
  Spinner,
} from '@patternfly/react-core';
import {useEffect, useState} from 'react';
import TeamViewKebab from './TeamViewKebab';
import {ITeams, useDeleteTeam, useFetchTeams} from 'src/hooks/UseTeams';
import {TeamsRoleDropDown} from './TeamsRoleDropDown';
import {BulkDeleteModalTemplate} from 'src/components/modals/BulkDeleteModalTemplate';
import {BulkOperationError, addDisplayError} from 'src/resources/ErrorHandling';
import ErrorModal from 'src/components/errors/ErrorModal';
import Empty from 'src/components/empty/Empty';
import {CubesIcon} from '@patternfly/react-icons';
import {ToolbarButton} from 'src/components/toolbar/ToolbarButton';
import {getTeamMemberPath} from 'src/routes/NavigationPath';
import {useAlerts} from 'src/hooks/UseAlerts';
import {AlertVariant} from 'src/atoms/AlertState';
import SetRepoPermissionForTeamModal from 'src/routes/OrganizationsList/Organization/Tabs/TeamsAndMembership/TeamsView/SetRepoPermissionsModal/SetRepoPermissionForTeamModal';

export const teamViewColumnNames = {
  teamName: 'Team name',
  members: 'Members',
  repositories: 'Repositories',
  teamRole: 'Team role',
};

export default function TeamsViewList(props: TeamsViewListProps) {
  const {
    teams,
    paginatedTeams,
    loading,
    error,
    page,
    setPage,
    perPage,
    setPerPage,
    search,
    setSearch,
  } = useFetchTeams(props.organizationName);

  const [selectedTeams, setSelectedTeams] = useState<ITeams[]>([]);
  const [isKebabOpen, setKebabOpen] = useState(false);
  const [deleteModalIsOpen, setDeleteModalIsOpen] = useState(false);
  const [err, setIsError] = useState<string[]>();
  const [searchParams] = useSearchParams();
  const {addAlert} = useAlerts();

  useEffect(() => {
    if (error) {
      addAlert({variant: AlertVariant.Failure, title: `Could not load teams`});
    }
  }, [error]);

  const handleDeleteModalToggle = () => {
    setKebabOpen(!isKebabOpen);
    setDeleteModalIsOpen(!deleteModalIsOpen);
  };

  const kebabItems = [
    <DropdownItem key="delete" onClick={handleDeleteModalToggle}>
      Delete
    </DropdownItem>,
  ];

  /* Mapper object used to render bulk delete table
    - keys are actual column names of the table
    - value is an object type with a "label" which maps to the attributes of <T>
      and an optional "transformFunc" which can be used to modify the value being displayed */
  const mapOfColNamesToTableData = {
    'Team Name': {
      label: 'name',
      transformFunc: (team: ITeams) => {
        return `${team.name}`;
      },
    },
    Members: {
      label: 'members',
      transformFunc: (team: ITeams) => team.member_count,
    },
    Repositories: {
      label: 'repositories',
      transformFunc: (team: ITeams) => {
        return `${team.repo_count}`;
      },
    },
    'Team Role': {
      label: 'team role',
      transformFunc: (team: ITeams) => (
        <Dropdown
          toggle={
            <DropdownToggle id="toggle-disabled" isDisabled>
              {team.role}
            </DropdownToggle>
          }
          isOpen={false}
          dropdownItems={[team.role]}
        />
      ),
    },
  };

  const {removeTeam} = useDeleteTeam({
    orgName: props.organizationName,
    onSuccess: () => {
      setDeleteModalIsOpen(!deleteModalIsOpen);
      setSelectedTeams([]);
      addAlert({
        variant: AlertVariant.Success,
        title: `Successfully deleted teams`,
      });
    },
    onError: (err) => {
      if (err instanceof BulkOperationError) {
        const errMessages = [];
        err.getErrors().forEach((error, team) => {
          addAlert({
            variant: AlertVariant.Failure,
            title: `Could not delete team ${team}: ${error.error}`,
          });
          errMessages.push(
            addDisplayError(`Failed to delete teams ${team}`, error.error),
          );
        });
        setIsError(errMessages);
      } else {
        setIsError([addDisplayError('Failed to delete teams', err)]);
      }
      setDeleteModalIsOpen(!deleteModalIsOpen);
      setSelectedTeams([]);
    },
  });

  const deleteModal = (
    <BulkDeleteModalTemplate
      mapOfColNamesToTableData={mapOfColNamesToTableData}
      handleModalToggle={handleDeleteModalToggle}
      handleBulkDeletion={removeTeam}
      isModalOpen={deleteModalIsOpen}
      selectedItems={teams?.filter((team) =>
        selectedTeams.some((selected) => team.name === selected.name),
      )}
      resourceName={'teams'}
    />
  );

  const onSelectTeam = (
    team: ITeams,
    rowIndex: number,
    isSelecting: boolean,
  ) => {
    setSelectedTeams((prevSelected) => {
      const otherSelectedTeams = prevSelected.filter(
        (t) => t.name !== team.name,
      );
      return isSelecting ? [...otherSelectedTeams, team] : otherSelectedTeams;
    });
  };

  const [isCreateTeamModalOpen, setIsCreateTeamModalOpen] = useState(false);
  const [isSetRepoPermModalOpen, setIsSetRepoPermModalOpen] = useState(false);
  const [repoPermForTeam, setRepoPermForTeam] = useState<string>('');

  const setRepoPermModal = (
    <SetRepoPermissionForTeamModal
      isModalOpen={isSetRepoPermModalOpen}
      handleModalToggle={() =>
        setIsSetRepoPermModalOpen(!isSetRepoPermModalOpen)
      }
      organizationName={props.organizationName}
      teamName={repoPermForTeam}
    />
  );

  if (loading) {
    return <Spinner />;
  }

  if (!loading && !paginatedTeams?.length) {
    return (
      <Empty
        title="There are no viewable teams for this organization"
        icon={CubesIcon}
        body="Either no teams exist yet or you may not have permission to view any. If you have the permissions, you may create team in this organization."
        button={
          <ToolbarButton
            id="create-new-team"
            buttonValue="Create new team"
            Modal={() => {}}
            isModalOpen={isCreateTeamModalOpen}
            setModalOpen={setIsCreateTeamModalOpen}
          />
        }
      />
    );
  }

  return (
    <PageSection variant={PageSectionVariants.light}>
      <ErrorModal
        title="Team deletion failed"
        error={err}
        setError={setIsError}
      />
      <TeamsViewToolbar
        selectedTeams={selectedTeams}
        deSelectAll={() => setSelectedTeams([])}
        allItems={teams}
        paginatedItems={paginatedTeams}
        onItemSelect={onSelectTeam}
        page={page}
        setPage={setPage}
        perPage={perPage}
        setPerPage={setPerPage}
        search={search}
        setSearch={setSearch}
        searchOptions={[teamViewColumnNames.teamName]}
        isKebabOpen={isKebabOpen}
        setKebabOpen={setKebabOpen}
        kebabItems={kebabItems}
        deleteKebabIsOpen={deleteModalIsOpen}
        deleteModal={deleteModal}
        isSetRepoPermModalOpen={isSetRepoPermModalOpen}
        setRepoPermModal={setRepoPermModal}
      >
        {props.children}
        <TableComposable aria-label="Selectable table">
          <Thead>
            <Tr>
              <Th />
              <Th>{teamViewColumnNames.teamName}</Th>
              <Th>{teamViewColumnNames.members}</Th>
              <Th>{teamViewColumnNames.repositories}</Th>
              <Th>{teamViewColumnNames.teamRole}</Th>
              <Th />
            </Tr>
          </Thead>
          <Tbody>
            {paginatedTeams?.map((team, rowIndex) => (
              <Tr key={rowIndex}>
                <Td
                  select={{
                    rowIndex,
                    onSelect: (_event, isSelecting) =>
                      onSelectTeam(team, rowIndex, isSelecting),
                    isSelected: selectedTeams.some((t) => t.name === team.name),
                  }}
                />
                <Td dataLabel={teamViewColumnNames.teamName}>{team.name}</Td>
                <Td dataLabel={teamViewColumnNames.members}>
                  <Link
                    to={getTeamMemberPath(
                      location.pathname,
                      props.organizationName,
                      team.name,
                      searchParams.get('tab'),
                    )}
                  >
                    {team.member_count}
                  </Link>
                </Td>
                <Td dataLabel={teamViewColumnNames.repositories}>
                  {team.repo_count}
                </Td>
                <Td dataLabel={teamViewColumnNames.teamRole}>
                  <TeamsRoleDropDown
                    organizationName={props.organizationName}
                    teamName={team.name}
                    teamRole={team.role}
                  />
                </Td>
                <Td data-label="kebab">
                  <TeamViewKebab
                    organizationName={props.organizationName}
                    team={team}
                    deSelectAll={() => setSelectedTeams([])}
                    onSelectRepo={() => {
                      setRepoPermForTeam(team.name);
                      setIsSetRepoPermModalOpen(!isSetRepoPermModalOpen);
                    }}
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </TableComposable>
      </TeamsViewToolbar>
    </PageSection>
  );
}

interface TeamsViewListProps {
  organizationName: string;
  children?: React.ReactNode;
}
