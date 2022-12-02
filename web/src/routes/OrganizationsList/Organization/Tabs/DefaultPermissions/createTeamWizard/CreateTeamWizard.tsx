import {
  Modal,
  ModalVariant,
  TextContent,
  Text,
  TextVariants,
  Wizard,
  AlertGroup,
  Alert,
  AlertActionCloseButton,
} from '@patternfly/react-core';
import {useState} from 'react';
import {ITeamMember, useAddMembersToTeam} from 'src/hooks/UseMembers';
import Conditional from 'src/components/empty/Conditional';
import AddToRepository from 'src/components/modals/robotAccountWizard/AddToRepository';
import {repoPermissionDropdownItems} from 'src/routes/RepositoriesList/RobotAccountsList';
import {useRepositories} from 'src/hooks/UseRepositories';
import {useRecoilState} from 'recoil';
import {
  selectedRobotReposPermissionState,
  selectedRobotReposState,
} from 'src/atoms/RobotAccountState';
import {addRepoPermissionToTeam} from 'src/resources/DefaultPermissionResource';
import Review from './ReviewTeam';
import AddTeamMember from './AddTeamMember';
import ReviewAndFinishFooter from './ReviewAndFinishFooter';
import NameAndDescription from './NameAndDescription';

export const CreateTeamWizard = (props: CreateTeamWizardProps): JSX.Element => {
  const [selectedMembers, setSelectedMembers] = useState<ITeamMember[]>([]);

  const [selectedRepoPerms, setSelectedRepoPerms] = useRecoilState(
    selectedRobotReposPermissionState,
  );
  const [selectedRepos, setSelectedRepos] = useRecoilState(
    selectedRobotReposState,
  );

  // Fetching repos
  const {repos} = useRepositories(props.orgName);

  const filteredRepos = () => {
    return selectedRepoPerms.filter((repo) =>
      selectedRepos.includes(repo.name),
    );
  };

  const {
    addMemberToTeam,
    errorAddingMemberToTeam: error,
    successAddingMemberToTeam: success,
    resetAddingMemberToTeam: reset,
  } = useAddMembersToTeam(props.orgName);

  const onSubmitTeamWizard = async () => {
    props.setAppliedTo({
      is_robot: false,
      name: props.teamName,
      kind: 'team',
    });
    if (selectedRepoPerms?.length > 0) {
      selectedRepoPerms.map(async (repo) => {
        await addRepoPermissionToTeam(props.orgName, repo.name, props.teamName, repo.permission);
      });
    }
    if (selectedMembers?.length > 0) {
      selectedMembers.map(async (mem) => {
        await addMemberToTeam({team: props.teamName, member: mem.name});
      });
    }
    props.handleWizardToggle();
  };

  const steps = [
    {
      name: 'Name & Description',
      component: (
        <>
          <TextContent>
            <Text component={TextVariants.h1}>Team name and description</Text>
          </TextContent>
          <NameAndDescription
            name={props.teamName}
            description={props.teamDescription}
            nameLabel="Team name for your new team:"
            descriptionLabel="Team description for your new team:"
          />
        </>
      ),
    },
    {
      name: 'Add to repository (optional)',
      component: (
        <AddToRepository
          namespace={props.orgName}
          dropdownItems={repoPermissionDropdownItems}
          repos={repos}
          selectedRepos={selectedRepos}
          setSelectedRepos={setSelectedRepos}
          selectedRepoPerms={selectedRepoPerms}
          setSelectedRepoPerms={setSelectedRepoPerms}
          wizardStep={true}
        />
      ),
    },
    {
      name: 'Add team member (optional)',
      component: (
        <>
          <TextContent>
            <Text component={TextVariants.h1}>Add team member (optional)</Text>
          </TextContent>
          <AddTeamMember
            orgName={props.orgName}
            selectedMembers={selectedMembers}
            setSelectedMembers={setSelectedMembers}
          />
        </>
      ),
    },
    {
      name: 'Review and Finish',
      component: (
        <>
          <TextContent>
            <Text component={TextVariants.h1}>Review</Text>
          </TextContent>
          <Review
            orgName={props.orgName}
            teamName={props.teamName}
            description={props.teamDescription}
            selectedMembers={selectedMembers}
            selectedRepos={filteredRepos()}
          />
        </>
      ),
    },
  ];

  return (
    <>
      <Conditional if={error}>
        <AlertGroup isToast isLiveRegion>
          <Alert
            variant="danger"
            title={`Unable to add member to ${props.teamName} team`}
            actionClose={<AlertActionCloseButton onClose={reset} />}
          />
        </AlertGroup>
      </Conditional>
      <Conditional if={success}>
        <AlertGroup isToast isLiveRegion>
          <Alert
            variant="success"
            title={`Sucessfully added member to ${props.teamName} team`}
            actionClose={<AlertActionCloseButton onClose={reset} />}
          />
        </AlertGroup>
      </Conditional>
      <Modal
        id="create-team-modal"
        aria-label="CreateTeam"
        variant={ModalVariant.large}
        isOpen={props.isTeamWizardOpen}
        onClose={props.handleWizardToggle}
        showClose={false}
        hasNoBodyWrapper
      >
        <Wizard
          titleId="create-team-wizard-label"
          descriptionId="create-team-wizard-description"
          title="Create team"
          description=""
          steps={steps}
          onClose={props.handleWizardToggle}
          height={600}
          width={1170}
          footer={
            <ReviewAndFinishFooter
              onSubmit={onSubmitTeamWizard}
              canSubmit={props.teamName !== ''}
            />
          }
        />
      </Modal>
    </>
  );
};

interface CreateTeamWizardProps {
  teamName: string;
  teamDescription: string;
  isTeamWizardOpen: boolean;
  handleWizardToggle?: () => void;
  orgName: string;
  setAppliedTo: (string) => void;
}
