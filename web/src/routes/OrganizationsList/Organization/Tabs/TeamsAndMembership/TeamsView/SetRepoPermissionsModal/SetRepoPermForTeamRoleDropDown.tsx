import {Dropdown, DropdownItem, DropdownToggle} from '@patternfly/react-core';
import {useEffect, useState} from 'react';
import {ITeamRepoPerms} from 'src/hooks/UseTeams';
import {RepoPermissionDropdownItems} from 'src/routes/RepositoriesList/RobotAccountsList';

export function SetRepoPermForTeamRoleDropDown(
  props: SetRepoPermForTeamRoleDropDownProps,
) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [dropdownValue, setDropdownValue] = useState<string>(
    props.repoPerm?.role,
  );

  const dropdownOnSelect = (roleName) => {
    setDropdownValue(roleName);
    props.dropdownOnSelect(roleName, props.repoPerm);
  };

  useEffect(() => {
    if (props?.isItemSelected) {
      dropdownOnSelect(props.selectedVal)
    }
  }, [props?.isItemSelected, props.selectedVal]);

  return (
    <Dropdown
      onSelect={() => setIsOpen(false)}
      toggle={
        <DropdownToggle onToggle={() => setIsOpen(!isOpen)}>
          {dropdownValue
            ? dropdownValue.charAt(0).toUpperCase() + dropdownValue.slice(1)
            : 'None'}
        </DropdownToggle>
      }
      isOpen={isOpen}
      dropdownItems={RepoPermissionDropdownItems.map((item) => (
        <DropdownItem
          key={item.name}
          description={item.description}
          onClick={() => dropdownOnSelect(item.name)}
        >
          {item.name}
        </DropdownItem>
      ))}
    />
  );
}

interface SetRepoPermForTeamRoleDropDownProps {
  organizationName: string;
  teamName: string;
  repoPerm: ITeamRepoPerms;
  dropdownOnSelect: (item, repoPerm) => void;
  isItemSelected?: boolean;
  selectedVal: string;
}
