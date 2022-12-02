import {PageSection, Spinner} from '@patternfly/react-core';

import {
  TableComposable,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@patternfly/react-table';
import {ITeamMember, useFetchMembers} from 'src/hooks/UseMembers';
import {Link} from 'react-router-dom';
import { useEffect, useState } from 'react';
import AddTeamToolbar from './AddTeamToolbar';

const memberColNames = {
  teamMember: 'Team Member',
  account: 'Account',
};

export default function AddTeamMember(props: AddTeamMemberProps) {

  const {
    teamMembers,
    robots,
    paginatedMembers,
    isLoading,
    error,
    page,
    setPage,
    perPage,
    setPerPage,
  } = useFetchMembers(props.orgName);

  const [tableItems, setTableItems] = useState<ITeamMember[]>(paginatedMembers);


  const showAllItems = () => {
    setTableItems(paginatedMembers)
  }

  const showSelectedItems = () => {
    setTableItems(props.selectedMembers)
  }

  useEffect(() => {
    if (tableItems?.length < 0) {
      setTableItems(paginatedMembers)
    }
  },[]);

  const onSelectMember = (
    member: ITeamMember,
    rowIndex: number,
    isSelecting: boolean,
  ) => {
    props.setSelectedMembers((prevSelected) => {
      const otherSelectedMembers = prevSelected.filter(
        (m) => m.name !== member.name,
      );
      return isSelecting
        ? [...otherSelectedMembers, member]
        : otherSelectedMembers;
    });
  };

  if (isLoading) {
    return <Spinner />;
  }

  if (error) {
    return <>Unable to load members list</>;
  }

  return (
    <>
      <PageSection>
        <AddTeamToolbar
          orgName={props.orgName}
          allItems={teamMembers}
          paginatedItems={paginatedMembers}
          selectedItems={props.selectedMembers}
          setSelectedMembers={props.setSelectedMembers}
          deSelectAll={() => props.setSelectedMembers([])}
          onItemSelect={onSelectMember}
          page={page}
          setPage={setPage}
          perPage={perPage}
          setPerPage={setPerPage}
          robots={robots}
          showAllItems={showAllItems}
          showSelectedItems={showSelectedItems}

        >
          <TableComposable aria-label="Selectable table">
            <Thead>
              <Tr>
                <Th />
                <Th>{memberColNames.teamMember}</Th>
                <Th>{memberColNames.account}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {paginatedMembers?.map((member, rowIndex) => (
                <Tr key={rowIndex}>
                  <Td
                    select={{
                      rowIndex,
                      onSelect: (_event, isSelecting) =>
                        onSelectMember(member, rowIndex, isSelecting),
                      isSelected: props.selectedMembers.some(
                        (p) => p.name === member.name,
                      ),
                    }}
                  />
                  <Td dataLabel={memberColNames.teamMember}>
                    <Link to="#">{member.name}</Link>
                  </Td>
                  <Td dataLabel={memberColNames.account}>
                    <Link to="#"> {member.account}</Link>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </TableComposable>
        </AddTeamToolbar>
      </PageSection>
    </>
  );
}

interface AddTeamMemberProps {
  orgName: string;
  selectedMembers: ITeamMember[];
  setSelectedMembers: (teams: any) => void;
}
