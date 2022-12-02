import {
  Drawer,
  DrawerActions,
  DrawerCloseButton,
  DrawerContent,
  DrawerContentBody,
  DrawerHead,
  DrawerPanelContent,
  Page,
  PageSection,
  PageSectionVariants,
  Tab,
  Tabs,
  TabTitleText,
  Title,
} from '@patternfly/react-core';
import {useParams, useSearchParams} from 'react-router-dom';
import {useCallback, useRef, useState} from 'react';
import RepositoriesList from 'src/routes/RepositoriesList/RepositoriesList';
import Settings from './Tabs/Settings/Settings';
import {QuayBreadcrumb} from 'src/components/breadcrumb/Breadcrumb';
import DefaultPermissions from './Tabs/DefaultPermissions/DefaultPermissions';
import CreatePermissionDrawer from 'src/routes/OrganizationsList/Organization/Tabs/DefaultPermissions/createPermissionDrawer/CreatePermissionDrawer';
import RobotAccountsList from 'src/routes/RepositoriesList/RobotAccountsList';
import {useQuayConfig} from 'src/hooks/UseQuayConfig';
import { useOrganizations } from 'src/hooks/UseOrganizations';
import { useOrganization } from 'src/hooks/UseOrganization';

export enum DrawerContentType {
  None,
  CreatePermissionSpecificUser,
}

export default function Organization() {

  const quayConfig = useQuayConfig();
  const {organizationName} = useParams();
  const {usernames} = useOrganizations();
  const isUserOrganization = usernames.includes(organizationName);

  const [searchParams, setSearchParams] = useSearchParams();

  const {organization} = useOrganization(organizationName);

  const [activeTabKey, setActiveTabKey] = useState<string>(
    searchParams.get('tab') || 'Repositories',
  );

  const onTabSelect = useCallback(
    (_event: React.MouseEvent<HTMLElement, MouseEvent>, tabKey: string) => {
      setSearchParams({tab: tabKey});
      setActiveTabKey(tabKey);
    },
    [],
  );

  const fetchTabVisibility = (tabname) => {
    if (quayConfig?.config?.REGISTRY_STATE == 'readonly') {
      return false;
    }

    if (!isUserOrganization && organization && (tabname == 'Settings' || tabname == 'Robot accounts')) {
      return organization.is_org_admin || organization.is_admin;
    }
    return false;
  }
  const [drawerContent, setDrawerContent] = useState<DrawerContentType>(
    DrawerContentType.None,
  );

  const closeDrawer = () => {
    setDrawerContent(DrawerContentType.None);
  };

  const drawerRef = useRef<HTMLDivElement>();

  const drawerContentOptions = {
    [DrawerContentType.None]: null,
    [DrawerContentType.CreatePermissionSpecificUser]: (
      <CreatePermissionDrawer
        orgName={organizationName}
        closeDrawer={closeDrawer}
        drawerRef={drawerRef}
        drawerContent={drawerContent}
      />
    ),
  };

  const repositoriesSubNav = [
    {
      name: 'Repositories',
      component: <RepositoriesList organizationName={organizationName} />,
      visible: true,
    },
    {
      name: 'Robot accounts',
      component: <RobotAccountsList organizationName={organizationName} />,
      visible: fetchTabVisibility('Robot accounts'),

    },
    {
      name: 'Default permissions',
      component: (
        <DefaultPermissions
          orgName={organizationName}
          setDrawerContent={setDrawerContent}
        />
      ),
      visible: true,
    },
    {
      name: 'Settings',
      component: <Settings organizationName={organizationName} />,
      visible: fetchTabVisibility('Settings'),
    },
  ];

  return (
    <Drawer
      isExpanded={drawerContent != DrawerContentType.None}
      onExpand={() => {
        drawerRef.current && drawerRef.current.focus();
      }}
    >
      <DrawerContent panelContent={drawerContentOptions[drawerContent]}>
        <DrawerContentBody>
        <Page>
      <QuayBreadcrumb />
      <PageSection
        variant={PageSectionVariants.light}
        className="no-padding-bottom"
      >
        <Title data-testid="repo-title" headingLevel="h1">
          {organizationName}
        </Title>
      </PageSection>
      <PageSection
        variant={PageSectionVariants.light}
        padding={{default: 'noPadding'}}
      >
        <Tabs activeKey={activeTabKey} onSelect={onTabSelect}>
          {repositoriesSubNav.filter((nav) => nav.visible).map((nav)=> (
            <Tab
              key={nav.name}
              eventKey={nav.name}
              title={<TabTitleText>{nav.name}</TabTitleText>}
                  >
                    {nav.component}
                  </Tab>
                ))}
              </Tabs>
            </PageSection>
          </Page>
        </DrawerContentBody>
      </DrawerContent>
    </Drawer>
  );
}
