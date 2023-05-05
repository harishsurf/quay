import {
  Dropdown,
  DropdownItem,
  KebabToggle,
  DropdownPosition,
} from '@patternfly/react-core';
import {useState} from 'react';
import {Link, useSearchParams} from 'react-router-dom';
import { AlertVariant } from 'src/atoms/AlertState';
import { useAlerts } from 'src/hooks/UseAlerts';
import {ITeams, useDeleteTeam} from 'src/hooks/UseTeams';
import {getTeamMemberPath} from 'src/routes/NavigationPath';

export default function TeamViewKebab(props: TeamViewKebabProps) {
  const [isKebabOpen, setIsKebabOpen] = useState<boolean>(false);
  const [searchParams] = useSearchParams();
  const {addAlert} = useAlerts();


  const onSelect = () => {
    setIsKebabOpen(false);
    const element = document.getElementById(`${props.team.name}-toggle-kebab`);
    element.focus();
  };

  const {removeTeam} = useDeleteTeam({
    orgName: props.organizationName,
    onSuccess: () => {
      props.deSelectAll();
      addAlert({variant: AlertVariant.Success, title: `Successfully deleted team`});
    },
    onError: (err) => {
      addAlert({
        variant: AlertVariant.Failure,
        title: `Failed to delete team: ${err}`,
      });
    },
  });

  return (
    <>
      <Dropdown
        onSelect={onSelect}
        toggle={
          <KebabToggle
            id={`${props.team.name}-toggle-kebab`}
            onToggle={() => {
              setIsKebabOpen(!isKebabOpen);
            }}
          />
        }
        isOpen={isKebabOpen}
        dropdownItems={[
          <DropdownItem
            key="link"
            component={
              <Link
                to={getTeamMemberPath(
                  location.pathname,
                  props.organizationName,
                  props.team.name,
                  searchParams.get('tab')
                )}
              >
                Manage team members
              </Link>
            }
            id={`${props.team.name}-manage-btn`}
          ></DropdownItem>,
          <DropdownItem
            key="set-repo-perms"
            onClick={props.onSelectRepo}
            id={`${props.team.name}-set-repo-perms-btn`}
          >
            Set repository permissions
          </DropdownItem>,
          <DropdownItem
            key="delete"
            onClick={() => removeTeam(props.team)}
            className="red-color"
            id={`${props.team.name}-del-btn`}
          >
            Delete
          </DropdownItem>,
        ]}
        isPlain
        position={DropdownPosition.right}
      />
    </>
  );
}

interface TeamViewKebabProps {
  organizationName: string;
  team: ITeams;
  deSelectAll: () => void;
  onSelectRepo: () => void;
}
