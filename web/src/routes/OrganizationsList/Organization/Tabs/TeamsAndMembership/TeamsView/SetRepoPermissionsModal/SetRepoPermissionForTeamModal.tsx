import {
  TableComposable,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@patternfly/react-table';
import {Button, Modal, ModalVariant, Spinner} from '@patternfly/react-core';
import {useState} from 'react';
import Empty from 'src/components/empty/Empty';
import {CubesIcon} from '@patternfly/react-icons';
import {useAlerts} from 'src/hooks/UseAlerts';
import SetRepoPermissionsToolbar from './SetRepoPermissionsForTeamToolbar';
import {
  ITeamRepoPerms,
  useFetchRepoPermForTeam,
  useUpdateTeamRepoPerm,
} from 'src/hooks/UseTeams';
import {SetRepoPermForTeamRoleDropDown} from './SetRepoPermForTeamRoleDropDown';
import {formatDate} from 'src/libs/utils';

export const setRepoPermForTeamColumnNames = {
  repoName: 'Repository',
  permissions: 'Permissions',
  lastUpdate: 'Last Updated',
};

export default function SetRepoPermissionForTeamModal(
  props: SetRepoPermissionForTeamModalProps,
) {
  const {
    teamRepoPerms,
    paginatedTeamRepoPerms,
    loading,
    error,
    page,
    setPage,
    perPage,
    setPerPage,
    search,
    setSearch,
  } = useFetchRepoPermForTeam(props.organizationName, props.teamName);

  const {
    updateRepoPerm,
    errorUpdateRepoPerm,
    detailedErrorUpdateRepoPerm,
    successUpdateRepoPerm,
    resetUpdateRepoPerm: reset,
  } = useUpdateTeamRepoPerm(props.organizationName, props.teamName);

  const [selectedRepoPerms, setSelectedRepoPerms] = useState<ITeamRepoPerms[]>(
    [],
  );
  const [modifiedRepoPerms, setModifiedRepoPerms] = useState<ITeamRepoPerms[]>(
    [],
  );
  const [isKebabOpen, setKebabOpen] = useState(false);
  const {addAlert} = useAlerts();

  // useEffect(() => {
  //   if (successUpdateRepoPerm) {
  //     addAlert({
  //       variant: AlertVariant.Success,
  //       title: `Updated repo perm for team: ${props.teamName} sucessfully`,
  //     });
  //   }
  //   if (errorUpdateRepoPerm) {
  //     let errorUpdatingRepoPermMessage = (
  //       <>
  //         {Array.from(detailedErrorUpdateRepoPerm.getErrors()).map(
  //           ([repoPerm, error]) => (
  //             <p key={repoPerm}>
  //               Could not update repo permission for {repoPerm}:{' '}
  //               {error.error.message}
  //             </p>
  //           ),
  //         )}
  //       </>
  //     );
  //     addAlert({
  //       variant: AlertVariant.Failure,
  //       title: `Could not update repo permissions`,
  //       message: errorUpdatingRepoPermMessage,
  //     });
  //   }
  // }, [successUpdateRepoPerm, errorUpdateRepoPerm]);

  const onSelectRepoPerm = (
    repoPerm: ITeamRepoPerms,
    rowIndex: number,
    isSelecting: boolean,
  ) => {
    setSelectedRepoPerms((prevSelected) => {
      const otherSelectedRepoPerms = prevSelected.filter(
        (t) => t.repoName !== repoPerm.repoName,
      );
      return isSelecting
        ? [...otherSelectedRepoPerms, repoPerm]
        : otherSelectedRepoPerms;
    });
  };

  const setRepoPermForTeamHandler = () => {
    updateRepoPerm({teamRepoPerms: modifiedRepoPerms});
    setTimeout(() => props.handleModalToggle(), 500);
  };

  if (loading) {
    return <Spinner />;
  }

  const updateRepoPerms = (roleName, repoPerm) => {
    // Remove item if already present
    setModifiedRepoPerms((prev) =>
      prev.filter((item) => item.repoName !== repoPerm.repoName),
    );
    setModifiedRepoPerms((prev) => [
      ...prev,
      {
        repoName: repoPerm.repoName,
        role: roleName,
        lastModified: repoPerm.lastModified,
      },
    ]);
  };


  const emptyPermComponent = (
    <Empty
      title="No matching repositories found"
      icon={CubesIcon}
      body="Either no repositories exist yet or you may not have permission to view any."
    />
  );

  const isItemSelected = (repoPerm) => selectedRepoPerms.some(
    (t) => t.repoName === repoPerm.repoName,
  );

  const fetchRepoPermission = (repoPerm) => {
    for (const item of modifiedRepoPerms) {
      if (repoPerm.repoName == item.repoName) {
        return item.role;
      }
    }
    return 'None'
  }

  return (
    <Modal
      title={`Set repository permissions for ${props.teamName}`}
      variant={ModalVariant.large}
      isOpen={props.isModalOpen}
      onClose={props.handleModalToggle}
      actions={[
        <Button
          id="update-team-repo-permissions"
          key="confirm"
          variant="primary"
          onClick={setRepoPermForTeamHandler}
          form="modal-with-form-form"
          isDisabled={modifiedRepoPerms?.length === 0}
        >
          Update
        </Button>,
        <Button
          id="update-team-repo-permissions-cancel"
          key="cancel"
          variant="link"
          onClick={props.handleModalToggle}
        >
          Cancel
        </Button>,
      ]}
    >
      {!teamRepoPerms?.length ? (
        emptyPermComponent
      ) : (
        <SetRepoPermissionsToolbar
          selectedRepoPerms={selectedRepoPerms}
          deSelectAll={() => setSelectedRepoPerms([])}
          allItems={teamRepoPerms}
          paginatedItems={paginatedTeamRepoPerms}
          onItemSelect={onSelectRepoPerm}
          page={page}
          setPage={setPage}
          perPage={perPage}
          setPerPage={setPerPage}
          search={search}
          setSearch={setSearch}
          searchOptions={[setRepoPermForTeamColumnNames.repoName]}
          isKebabOpen={isKebabOpen}
          setKebabOpen={setKebabOpen}
          updateRepoPerms={updateRepoPerms}
        >
          <TableComposable aria-label="Selectable table">
            <Thead>
              <Tr>
                <Th />
                <Th>{setRepoPermForTeamColumnNames.repoName}</Th>
                <Th>{setRepoPermForTeamColumnNames.permissions}</Th>
                <Th>{setRepoPermForTeamColumnNames.lastUpdate}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {paginatedTeamRepoPerms?.map((repoPerm, rowIndex) => (
                <Tr key={rowIndex}>
                  <Td
                    select={{
                      rowIndex,
                      onSelect: (_event, isSelecting) =>
                        onSelectRepoPerm(repoPerm, rowIndex, isSelecting),
                      isSelected: isItemSelected(repoPerm),
                    }}
                  />
                  <Td dataLabel={setRepoPermForTeamColumnNames.repoName}>
                    {repoPerm.repoName}
                  </Td>
                  <Td dataLabel={setRepoPermForTeamColumnNames.permissions}>
                    <SetRepoPermForTeamRoleDropDown
                      organizationName={props.organizationName}
                      teamName={props.teamName}
                      repoPerm={repoPerm}
                      dropdownOnSelect={updateRepoPerms}
                      isItemSelected={isItemSelected(repoPerm)}
                      selectedVal={fetchRepoPermission(repoPerm)}
                    />
                  </Td>
                  <Td dataLabel={setRepoPermForTeamColumnNames.lastUpdate}>
                    {formatDate(repoPerm.lastModified)}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </TableComposable>
        </SetRepoPermissionsToolbar>
      )}
    </Modal>
  );
}

interface SetRepoPermissionForTeamModalProps {
  organizationName: string;
  teamName: string;
  isModalOpen: boolean;
  handleModalToggle: () => void;
}
