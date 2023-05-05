import {
  Button,
  PageSection,
  PageSectionVariants,
  Spinner,
} from '@patternfly/react-core';
import CollaboratorsViewToolbar from './CollaboratorsViewToolbar';
import {
  TableComposable,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@patternfly/react-table';
import {
  useDeleteCollaborator,
  useFetchCollaborators,
} from 'src/hooks/UseMembers';
import {useEffect, useState} from 'react';
import {IMembers} from 'src/resources/MembersResource';
import {TrashIcon} from '@patternfly/react-icons';
import { useAlerts } from 'src/hooks/UseAlerts';
import { AlertVariant } from 'src/atoms/AlertState';

export const collaboratorViewColumnNames = {
  username: 'User name',
  directRepositoryPermissions: 'Direct repository permissions',
};

export default function CollaboratorsViewList(
  props: CollaboratorsViewListProps,
) {
  const {
    collaborators,
    paginatedCollaborators,
    loading,
    error,
    page,
    setPage,
    perPage,
    setPerPage,
    search,
    setSearch,
  } = useFetchCollaborators(props.organizationName);

  const [selectedCollaborators, setSelectedCollaborators] = useState<
    IMembers[]
  >([]);
  const {addAlert} = useAlerts();

  useEffect(() => {
    if (error) {
      addAlert({
        variant: AlertVariant.Failure,
        title: `Could not load collaborators`,
      });
    }
  }, [error]);

  const onSelectCollaborator = (
    collaborator: IMembers,
    rowIndex: number,
    isSelecting: boolean,
  ) => {
    setSelectedCollaborators((prevSelected) => {
      const otherSelectedCollaborators = prevSelected.filter(
        (m) => m.name !== collaborator.name,
      );
      return isSelecting
        ? [...otherSelectedCollaborators, collaborator]
        : otherSelectedCollaborators;
    });
  };

  const {
    removeCollaborator,
    errorDeleteCollaborator,
    successDeleteCollaborator,
  } = useDeleteCollaborator(props.organizationName);

  useEffect(() => {
    if (errorDeleteCollaborator) {
      addAlert({variant: AlertVariant.Failure, title: `Error deleting collaborator`});
    }
  }, [errorDeleteCollaborator]);

  useEffect(() => {
    if (successDeleteCollaborator) {
      addAlert({variant: AlertVariant.Success, title: `Successfully deleted collaborator`});
    }
  }, [successDeleteCollaborator]);

  if (loading) {
    return <Spinner />;
  }

  return (
    <PageSection variant={PageSectionVariants.light}>
      <CollaboratorsViewToolbar
        selectedMembers={selectedCollaborators}
        deSelectAll={() => setSelectedCollaborators([])}
        allItems={collaborators}
        paginatedItems={paginatedCollaborators}
        onItemSelect={onSelectCollaborator}
        page={page}
        setPage={setPage}
        perPage={perPage}
        setPerPage={setPerPage}
        search={search}
        setSearch={setSearch}
        searchOptions={[collaboratorViewColumnNames.username]}
      >
        {props.children}
        <TableComposable aria-label="Selectable table">
          <Thead>
            <Tr>
              <Th />
              <Th>{collaboratorViewColumnNames.username}</Th>
              <Th>{collaboratorViewColumnNames.directRepositoryPermissions}</Th>
              <Th></Th>
            </Tr>
          </Thead>
          <Tbody>
            {paginatedCollaborators?.map((collaborator, rowIndex) => (
              <Tr key={rowIndex}>
                <Td
                  select={{
                    rowIndex,
                    onSelect: (_event, isSelecting) =>
                      onSelectCollaborator(collaborator, rowIndex, isSelecting),
                    isSelected: selectedCollaborators.some(
                      (t) => t.name === collaborator.name,
                    ),
                  }}
                />
                <Td dataLabel={collaboratorViewColumnNames.username}>
                  {collaborator.name}
                </Td>
                <Td
                  dataLabel={
                    collaboratorViewColumnNames.directRepositoryPermissions
                  }
                >
                  Direct permissions on {collaborator.repositories?.length}{' '}
                  repositories under this organization
                </Td>
                <Td>
                  <Button
                    icon={<TrashIcon />}
                    variant="plain"
                    onClick={() =>
                      removeCollaborator({
                        collaborator: collaborator.name,
                      })
                    }
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </TableComposable>
      </CollaboratorsViewToolbar>
    </PageSection>
  );
}

interface CollaboratorsViewListProps {
  organizationName: string;
  children?: React.ReactNode;
}
