# Quay Architecture Overview

## Dual UI Architecture

Quay maintains **two separate frontend implementations** that share the same backend:

- **Angular UI (Legacy)**: `static/` directory
  - Original AngularJS-based UI
  - Being gradually phased out
  - Still in production use

- **React UI (Modern)**: `web/` directory
  - Built with React 18+ and PatternFly v5
  - Modern replacement for Angular UI
  - Gradual migration in progress

**Critical Constraint**: Both UIs use the **same Flask backend APIs**. Any backend changes must maintain backward compatibility with the Angular UI.

## Migration Strategy

- **Feature parity required**: React UI must match Angular functionality before switchover
- **No breaking backend changes**: Backend modifications must not break Angular UI
- **Gradual transition**: Features migrated one at a time
- **Coexistence period**: Both UIs will run in production during migration

## Project Structure

```
quay/
├── web/                          # React UI (PatternFly v5)
│   ├── src/
│   │   ├── routes/              # Page-level components (route handlers)
│   │   ├── components/          # Reusable UI components
│   │   │   └── modals/         # Modal dialogs
│   │   ├── hooks/              # Custom React hooks (Use* pattern)
│   │   ├── resources/          # API client layer (*Resource.ts)
│   │   ├── contexts/           # React Context providers (global state)
│   │   ├── libs/               # Utilities (axios, etc.)
│   │   └── utils/              # Helper functions
│   ├── cypress/                # End-to-end tests
│   │   ├── e2e/               # Test specs (*.cy.ts)
│   │   ├── fixtures/          # Mock data
│   │   └── support/           # Custom commands
│   └── public/                # Static assets
│
├── static/                      # Angular UI (legacy)
│   ├── js/                     # AngularJS code
│   └── css/                    # Stylesheets
│
├── endpoints/                   # Flask backend API
├── data/                       # Database models
├── util/                       # Backend utilities
└── local-dev/                  # Local development setup
    └── stack/                  # Docker compose stack
        └── config.yaml         # Local Quay config
```

## Key Technologies

### React UI (web/)
- **Framework**: React 18+ with hooks (functional components only)
- **UI Library**: PatternFly v5 (Red Hat design system)
- **Language**: TypeScript
- **State Management**:
  - React Query (@tanstack/react-query) for server state
  - React Context for global UI state
  - Local state (useState) for component state
- **HTTP Client**: Axios with custom interceptors
- **Testing**: Cypress for E2E, React Testing Library for unit tests
- **Build Tool**: Webpack (via Create React App)

### Backend
- **Framework**: Flask (Python)
- **Database**: PostgreSQL
- **Authentication**: Database, LDAP, OIDC, AppToken
- **API Style**: REST
- **CORS**: Required for local development

## Development Environments

### Local Development URLs
- **React UI**: http://localhost:9000 (dev server)
- **Angular UI**: http://localhost:8080 (served by backend)
- **Backend API**: http://localhost:8080/api/v1/*

### CORS Configuration
For local React development, add to `local-dev/stack/config.yaml`:
```yaml
CORS_ORIGIN: "http://localhost:9000"
```

## Data Flow

```
User
  ↓
React Component (routes/)
  ↓
Custom Hook (hooks/Use*.ts)
  ↓
Resource Layer (resources/*Resource.ts)
  ↓
Axios Instance (libs/axios.ts)
  ↓
Flask Backend (endpoints/)
  ↓
Database
```

## Authentication Flow

### Session-Based Auth
- User logs in → session cookie created
- Session cookie sent with all requests
- CSRF token required for mutations

## Important Conventions

### Naming
- **Components**: PascalCase (`MyComponent.tsx`)
- **Hooks**: PascalCase with `Use` prefix (`UseMyHook.ts`)
- **Resources**: PascalCase with `Resource` suffix (`MyResource.ts`)
- **Utilities**: camelCase (`myUtil.ts`)

### File Organization
- One component per file
- Export routes as default
- Export utilities/hooks as named exports
- Collocate tests with source files when applicable

### TypeScript
- Interfaces for props: `ComponentNameProps`
- Strict null checks enabled
- Prefer `interface` over `type` for object shapes

## Testing Strategy

### E2E Tests (Cypress)
- Test user workflows end-to-end
- Mock backend APIs with `cy.intercept()`
- Run against production build on port 9000
- Located in `web/cypress/e2e/*.cy.ts`

### Unit Tests (Jest + React Testing Library)
- Test component behavior in isolation
- Mock API calls and context
- Located next to source files (`*.test.tsx`)

## Common Gotchas

1. **Backend API changes**: Must maintain Angular compatibility
2. **PatternFly imports**: Import from `@patternfly/react-core`, not individual packages
3. **State management**: Use React Query for server state, not Context
4. **CSS**: Use PatternFly design tokens, not custom CSS
5. **Testing**: Always add `data-testid` attributes for Cypress selectors
6. **Fresh login**: Use `isFreshLoginError()` utility to filter error messages

## Useful Resources

- [PatternFly Documentation](https://www.patternfly.org/)
- [React Query Documentation](https://tanstack.com/query/latest)
- [Cypress Documentation](https://docs.cypress.io/)
- Quay API: Explore via `/api/v1/discovery` endpoint
