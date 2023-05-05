import {
  Button,
  Flex,
  FlexItem,
  PanelFooter,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
} from '@patternfly/react-core';
import {DropdownCheckbox} from 'src/components/toolbar/DropdownCheckbox';
import {Kebab} from 'src/components/toolbar/Kebab';
import {SearchDropdown} from 'src/components/toolbar/SearchDropdown';
import { SearchInput } from 'src/components/toolbar/SearchInput';
import {SearchState} from 'src/components/toolbar/SearchTypes';
import {ToolbarPagination} from 'src/components/toolbar/ToolbarPagination';
import {ITeams} from 'src/hooks/UseTeams';

export default function TeamsViewToolbar(props: TeamsViewToolbarProps) {

  const handleCreateTeamWizard = () => {}
  
  return (
    <>
      <Toolbar>
        <ToolbarContent>
          <DropdownCheckbox
            selectedItems={props.selectedTeams}
            deSelectAll={props.deSelectAll}
            allItemsList={props.allItems}
            itemsPerPageList={props.paginatedItems}
            onItemSelect={props.onItemSelect}
          />
          <SearchDropdown
            items={props.searchOptions}
            searchState={props.search}
            setSearchState={props.setSearch}
          />
          <Flex className="pf-u-mr-md">
            <FlexItem>
              <SearchInput
                searchState={props.search}
                onChange={props.setSearch}
              />
            </FlexItem>
          </Flex>
          <Button onClick={handleCreateTeamWizard}>Create new team</Button>
          <ToolbarItem>
            {props.selectedTeams?.length !== 0 ? (
              <Kebab
                isKebabOpen={props.isKebabOpen}
                setKebabOpen={props.setKebabOpen}
                kebabItems={props.kebabItems}
                useActions={true}
              />
            ) : null}
            {props.deleteKebabIsOpen ? props.deleteModal : null}
            {props.isSetRepoPermModalOpen ? props.setRepoPermModal : null}
          </ToolbarItem>
          <ToolbarPagination
            itemsList={props.allItems}
            perPage={props.perPage}
            page={props.page}
            setPage={props.setPage}
            setPerPage={props.setPerPage}
          />
        </ToolbarContent>
      </Toolbar>
      {props.children}
      <PanelFooter>
        <ToolbarPagination
          itemsList={props.allItems}
          perPage={props.perPage}
          page={props.page}
          setPage={props.setPage}
          setPerPage={props.setPerPage}
          bottom={true}
        />
      </PanelFooter>
    </>
  );
}

interface TeamsViewToolbarProps {
  selectedTeams: ITeams[];
  deSelectAll: () => void;
  allItems: ITeams[];
  paginatedItems: ITeams[];
  onItemSelect: (item: ITeams, rowIndex: number, isSelecting: boolean) => void;
  page: number;
  setPage: (page: number) => void;
  perPage: number;
  setPerPage: (perPage: number) => void;
  searchOptions: string[];
  search: SearchState;
  setSearch: (search: SearchState) => void;
  children?: React.ReactNode;
  isKebabOpen: boolean;
  setKebabOpen: (open: boolean) => void;
  kebabItems: React.ReactElement[];
  deleteKebabIsOpen: boolean;
  deleteModal: object;
  isSetRepoPermModalOpen: boolean;
  setRepoPermModal: object;
}
