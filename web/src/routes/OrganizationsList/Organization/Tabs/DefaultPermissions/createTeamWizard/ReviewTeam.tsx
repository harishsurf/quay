import {
  Text,
  TextContent,
  TextVariants,
  Form,
  FormGroup,
  TextInput,
} from '@patternfly/react-core';
import {ITeamMember} from 'src/hooks/UseMembers';

export default function Review(props: ReviewProps) {

  return (
    <>
      <Form>
        <FormGroup label="Team name" fieldId="team-name" isRequired disabled>
          <TextInput
            value={props.teamName}
            type="text"
            aria-label="team-name-value"
            isDisabled
            className="fit-content"
          />
        </FormGroup>
        <FormGroup
          label="Description"
          fieldId="team-description"
          disabled
        >
          <TextInput
            value={props.description}
            type="text"
            aria-label="team-description"
            isDisabled
            className="fit-content"
          />
        </FormGroup>
        <FormGroup
          label="Repositories"
          fieldId="team-repositories"
          isRequired
          disabled
        >
          <TextInput
            value={props.selectedRepos?.map((item) => item.name).join(', ')}
            type="text"
            aria-label="team-repositories"
            isDisabled
            className="fit-content"
          />
        </FormGroup>
        <FormGroup
          label="Members"
          fieldId="team-members"
          isRequired
          disabled
        >
          <TextInput
            value={props.selectedMembers?.map((item) => item.name).join(', ')}
            type="text"
            aria-label="team-members"
            isDisabled
            className="fit-content"
          />
        </FormGroup>
      </Form>
    </>
  );
}

interface ReviewProps {
  orgName?: string;
  teamName: string;
  description: string;
  selectedMembers: ITeamMember[];
  selectedRepos: any[];
}
