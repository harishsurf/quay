# Testing Patterns for Quay React UI

This document covers common testing patterns used in Cypress E2E tests.

## Test Organization

### File Locations
- **Tests**: `web/cypress/e2e/*.cy.ts`
- **Fixtures**: `web/cypress/fixtures/*.json` - Mock API response data
- **Support**: `web/cypress/support/` - Custom commands and global setup
- **Screenshots**: `web/cypress/screenshots/` - Captured on test failure
- **Videos**: `web/cypress/videos/` - Test run recordings

### Test Structure
```typescript
describe('Feature Name', () => {
  before(() => {
    // Runs once before all tests in this describe block
    cy.exec('npm run quay:seed'); // Seed database
  });

  beforeEach(() => {
    // Runs before each test
    cy.loginByCSRF(token); // Login
    cy.intercept('GET', '/config', config).as('getConfig'); // Mock API
  });

  it('should do something specific', () => {
    // Test implementation
  });
});
```

## Common Patterns

### 1. API Mocking with Intercept

#### Basic Mock
```typescript
cy.intercept('GET', '/api/v1/user/', {
  statusCode: 200,
  body: {username: 'user1', email: 'user1@example.com'},
}).as('getUser');

cy.visit('/dashboard');
cy.wait('@getUser'); // Wait for request to complete
```

#### Loading Fixtures
```typescript
cy.fixture('user.json').then((user) => {
  cy.intercept('GET', '/api/v1/user/', user).as('getUser');
});

// Or directly:
cy.intercept('GET', '/api/v1/user/', {fixture: 'user.json'}).as('getUser');
```

#### Sequential Responses with Call Counter
```typescript
let callCount = 0;

cy.intercept('POST', '/api/v1/action', (req) => {
  callCount += 1;

  if (callCount === 1) {
    // First call - returns error
    req.reply({
      statusCode: 401,
      body: {
        title: 'fresh_login_required',
        error_message: 'Fresh login required',
      },
    });
  } else if (callCount === 2) {
    // Second call - returns success
    req.reply({
      statusCode: 200,
      body: {success: true},
    });
  }
}).as('performAction');
```

#### Conditional Responses
```typescript
cy.intercept('PUT', '/api/v1/superuser/users/tom', (req) => {
  if (req.body.email) {
    // Handle email change
    req.reply({statusCode: 200, body: {}});
  } else if (req.body.password) {
    // Handle password change
    req.reply({statusCode: 200, body: {}});
  } else if (Object.hasOwn(req.body, 'enabled')) {
    // Handle enable/disable
    req.reply({statusCode: 200, body: {}});
  }
}).as('updateUser');
```

### 2. Testing Fresh Login Flow

#### Basic Fresh Login Test
```typescript
it('should show password verification when fresh login is required', () => {
  // Mock API call that requires fresh login
  let apiCallCount = 0;
  cy.intercept('POST', '/api/v1/sensitive-action', (req) => {
    apiCallCount += 1;
    if (apiCallCount === 1) {
      // First attempt - fresh login required
      req.reply({
        statusCode: 401,
        body: {
          title: 'fresh_login_required',
          error_message: 'Fresh login required',
        },
      });
    } else {
      // After verification - success
      req.reply({statusCode: 200, body: {success: true}});
    }
  }).as('sensitiveAction');

  // Mock successful password verification
  cy.intercept('POST', '/api/v1/signin/verify', {
    statusCode: 200,
    body: {success: true},
  }).as('verifyPassword');

  // Trigger the action
  cy.visit('/page');
  cy.get('[data-testid="action-button"]').click();
  cy.wait('@sensitiveAction');

  // Verify fresh login modal appears
  cy.contains('Please Verify').should('exist');
  cy.contains('It has been more than a few minutes since you last logged in').should('exist');
  cy.get('#fresh-password').should('exist');

  // Enter password and verify
  cy.get('#fresh-password').type('password');
  cy.get('button').contains('Verify').click();

  // Wait for verification
  cy.wait('@verifyPassword');

  // Should retry original action
  cy.wait('@sensitiveAction');

  // Modal should close
  cy.contains('Please Verify').should('not.exist');
});
```

#### Testing Wrong Password
```typescript
it('should show error alert when wrong password is entered', () => {
  // Mock fresh login required
  cy.intercept('POST', '/api/v1/action', {
    statusCode: 401,
    body: {
      title: 'fresh_login_required',
      error_message: 'Fresh login required',
    },
  }).as('actionRequiresFreshLogin');

  // Mock failed password verification
  cy.intercept('POST', '/api/v1/signin/verify', {
    statusCode: 403,
    body: {
      message: 'Invalid Username or Password',
      invalidCredentials: true,
    },
  }).as('verifyPasswordFailed');

  // Trigger action
  cy.visit('/page');
  cy.get('[data-testid="action-button"]').click();
  cy.wait('@actionRequiresFreshLogin');

  // Fresh login modal appears
  cy.contains('Please Verify').should('exist');

  // Enter WRONG password
  cy.get('#fresh-password').type('wrongpassword');
  cy.get('button').contains('Verify').click();

  // Wait for failed verification
  cy.wait('@verifyPasswordFailed');

  // Modal closes
  cy.contains('Please Verify').should('not.exist');

  // Error alert appears
  cy.contains('Invalid verification credentials').should('be.visible');

  // Expand alert to see details
  cy.get('button[aria-label="Danger alert details"]').click();
  cy.contains('Invalid Username or Password').should('be.visible');
});
```

### 3. Testing Toast Alerts

#### Check Alert Appears
```typescript
// Basic alert check
cy.contains('Operation successful').should('be.visible');

// Specific alert variant
cy.get('[data-testid="success-alert"]').should('be.visible');
```

#### Expand Alert Details
```typescript
// Click to expand PatternFly alert
cy.get('button[aria-label="Danger alert details"]').click();

// Now check expanded content
cy.contains('Detailed error message').should('be.visible');
```

#### Close Alert
```typescript
// Close specific alert
cy.get('button[aria-label*="Close Danger alert"]').click();

// Verify alert is gone
cy.contains('Error message').should('not.exist');
```

### 4. Testing Modals

#### Open and Interact with Modal
```typescript
// Open modal
cy.get('[data-testid="create-user-button"]').click();

// Modal should be visible
cy.get('[data-testid="create-user-modal"]').should('be.visible');
cy.contains('Create New User').should('be.visible');

// Fill form within modal context (scoped selectors)
cy.get('[role="dialog"]').within(() => {
  cy.get('input[type="email"]').type('user@example.com');
  cy.get('input[type="password"]').type('password123');
  cy.contains('button', 'Create User').click();
});
```

#### Verify Modal Closes
```typescript
// After action completes
cy.contains('Create New User').should('not.exist');
cy.get('[role="dialog"]').should('not.exist');
```

### 5. Waiting for Loading States

#### Wait for Loading Spinner to Disappear
```typescript
// PatternFly bullseye spinner (common loading indicator)
cy.get('.pf-v5-l-bullseye').should('not.exist');
```

#### Wait for Network Requests
```typescript
// Always use aliases for important requests
cy.intercept('GET', '/api/v1/data').as('getData');
cy.visit('/page');

// Wait before interacting
cy.wait('@getData');

// Now safe to interact
cy.get('[data-testid="data-table"]').should('be.visible');
```

#### Wait for Multiple Requests
```typescript
cy.wait(['@getConfig', '@getUser', '@getData']);
```

## Running Tests

### Basic Commands

```bash
# Run all tests
cd web
npm run test:integration

# Run specific file
npm run test:integration -- --spec cypress/e2e/my-test.cy.ts

# Run with headed browser (see UI)
node_modules/.bin/cypress run \
  --spec cypress/e2e/my-test.cy.ts \
  --browser chrome \
  --headed \
  --no-exit

# Open Cypress UI (interactive)
node_modules/.bin/cypress open
```

### Run Only Specific Tests

Temporarily add `.only()` to focus on specific tests:

```typescript
// Run only this describe block
describe.only('Feature Name', () => {
  it('test 1', () => {});
  it('test 2', () => {});
});

// Run only this test
describe('Feature Name', () => {
  it.only('test 1', () => {}); // Only this runs
  it('test 2', () => {});       // Skipped
});
```

**Important**: Remove `.only()` before committing!

### Skip Tests

```typescript
// Skip entire describe block
describe.skip('Feature Name', () => {});

// Skip specific test
it.skip('test name', () => {});
```

## Test Data Management

### Database Seeding

```bash
# Seed both database and storage
npm run quay:seed

# Or run individually:
npm run quay:seed-db      # Load SQL dump
npm run quay:seed-storage # Copy storage files
```

**Data location**:
- Database dump: `cypress/test/quay-db-data.txt`
- Storage files: `cypress/test/quay-storage-data/`

### Using Fixtures

```typescript
// Load fixture once before tests
before(() => {
  cy.fixture('superuser-users.json').as('usersData');
});

// Use loaded fixture
cy.get('@usersData').then((users) => {
  cy.intercept('GET', '/api/v1/superuser/users/', {body: users});
});

// Or use directly in intercept
cy.intercept('GET', '/api/v1/superuser/users/', {
  fixture: 'superuser-users.json',
});
```

## Common Selectors

### Data Test IDs (Preferred)
```typescript
cy.get('[data-testid="submit-button"]')
cy.get('[data-testid="user-row-tom"]')
```

### By Text Content
```typescript
cy.contains('Submit')
cy.contains('button', 'Submit') // More specific
```

### By Role (Accessible)
```typescript
cy.get('button').contains('Submit')
cy.get('[role="dialog"]')
```

### Within Context (Scoped)
```typescript
cy.get('[role="dialog"]').within(() => {
  cy.contains('Submit').click();
});
```

## Common Gotchas

### 1. Race Conditions
```typescript
// BAD - might click before element is ready
cy.visit('/page');
cy.get('[data-testid="button"]').click();

// GOOD - wait for API response first
cy.visit('/page');
cy.wait('@getData');
cy.get('[data-testid="button"]').click();
```

### 2. Stale Element References
```typescript
// BAD - element reference becomes stale after navigation
const button = cy.get('[data-testid="button"]');
cy.visit('/page');
button.click(); // May fail

// GOOD - get fresh reference
cy.visit('/page');
cy.get('[data-testid="button"]').click();
```

### 3. Multiple Elements
```typescript
// If selector matches multiple elements, use .first(), .last(), or .eq()
cy.get('[data-testid="row"]').first().click();
cy.get('[data-testid="row"]').eq(1).click(); // Second element (0-indexed)
```

### 4. Hidden Elements
```typescript
// Force click on hidden/covered elements
cy.get('[data-testid="hidden-button"]').click({force: true});
```

### 5. Async Operations
```typescript
// BAD - doesn't wait
const data = cy.request('/api/data').then(r => r.body);
cy.log(data); // undefined

// GOOD - use then()
cy.request('/api/data').then((response) => {
  cy.log(response.body);
});
```

## Debugging Tests

### Take Screenshots
```typescript
cy.screenshot('error-state');
```

### Console Logging
```typescript
cy.get('[data-testid="element"]').then((element) => {
  console.log(element);
});
```

### Pause Execution
```typescript
cy.pause(); // Opens interactive mode
cy.debug(); // Prints debug info
```

### Check Network Activity
```typescript
// Intercept all requests for debugging
cy.intercept('**', (req) => {
  console.log('Request:', req.method, req.url);
});
```

### View Console Messages
```typescript
cy.window().then((win) => {
  cy.spy(win.console, 'error').as('consoleError');
});

// Later, check if errors logged
cy.get('@consoleError').should('not.be.called');
```

## Best Practices

### ✅ DO
- Use `data-testid` attributes for selectors
- Wait for API calls with `cy.wait('@alias')`
- Wait for loading spinners to disappear
- Use `within()` for scoped selectors
- Mock API responses with `cy.intercept()`
- Add descriptive test names
- Group related tests in `describe()` blocks
- Clean up state in `beforeEach()`

### ❌ DON'T
- Use CSS class selectors (they change)
- Click before page is loaded
- Test implementation details
- Share state between tests
- Use hardcoded waits (`cy.wait(5000)`)
- Forget to remove `.only()` before committing
- Test multiple features in one test
- Ignore failing tests

## Test Checklist

When writing a new Cypress test:
- [ ] Add `data-testid` to new components
- [ ] Mock all API responses with `cy.intercept()`
- [ ] Use aliases for important requests (`as('requestName')`)
- [ ] Wait for requests with `cy.wait('@requestName')`
- [ ] Wait for loading spinners to disappear
- [ ] Use `within()` for modal interactions
- [ ] Test both success and error paths
- [ ] Verify alerts appear/close correctly
- [ ] Clean up with `beforeEach()`
- [ ] Remove `.only()` before committing

## Example: Complete Test File

```typescript
/// <reference types="cypress" />

describe('User Management', () => {
  before(() => {
    cy.exec('npm run quay:seed');
  });

  beforeEach(() => {
    cy.loginByCSRF();

    cy.fixture('config.json').then((config) => {
      cy.intercept('GET', '/config', config).as('getConfig');
    });

    cy.intercept('GET', '/api/v1/superuser/users/', {
      fixture: 'users.json',
    }).as('getUsers');

    cy.visit('/organization');
    cy.wait(['@getConfig', '@getUsers']);
    cy.get('.pf-v5-l-bullseye').should('not.exist');
  });

  it('successfully creates user', () => {
    cy.intercept('POST', '/api/v1/superuser/users/', {
      statusCode: 201,
      body: {username: 'newuser', email: 'new@example.com'},
    }).as('createUser');

    cy.get('[data-testid="create-user-button"]').click();

    cy.get('[role="dialog"]').within(() => {
      cy.get('[data-testid="username-input"]').type('newuser');
      cy.get('[data-testid="email-input"]').type('new@example.com');
      cy.get('[data-testid="password-input"]').type('password123');
      cy.contains('button', 'Create User').click();
    });

    cy.wait('@createUser');

    // Success alert appears
    cy.contains('Successfully created user').should('be.visible');
  });
});
```

## Related Documentation
- Cypress Official Docs: https://docs.cypress.io/
- PatternFly Testing: https://www.patternfly.org/get-started/develop#testing
- React Testing Best Practices: https://kentcdodds.com/blog/common-mistakes-with-react-testing-library
