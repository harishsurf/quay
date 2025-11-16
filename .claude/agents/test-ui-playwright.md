# UI Testing with Playwright - Agent Command

## Overview
This document provides instructions for testing the Quay React UI using Playwright browser automation. Use this as a reference when testing UI implementations, navigation flows, and component interactions.

## Prerequisites

### Application Setup
- **URL**: `http://localhost:9000` - React UI
- **URL**: `http://localhost:8080` - Angular UI
- **Default User**: `user1`
- **Default Password**: `password`
- **Application must be running** on localhost before starting tests

### Browser Automation
- Uses Playwright MCP tools (`mcp__playwright__*`)
- Tests run against the New UI (React-based)
- No login required if already authenticated in browser session
- both ui use same backend
- The toggle newui-currentui doesn't work for localhost. To switch b/w UIs, use the above different urls for each

### Playwright Tool Permissions
The following Playwright tools can be used without requiring user approval:
- `mcp__playwright__browser_navigate` - Navigate to URLs
- `mcp__playwright__browser_evaluate` - Execute JavaScript in browser context
- `mcp__playwright__browser_type` - Type text into input fields
- `mcp__playwright__browser_click` - Click on elements
- `mcp__playwright__browser_take_screenshot` - Capture screenshots
- `mcp__playwright__browser_resize` - Resize browser window
- `mcp__playwright__browser_wait_for` - Wait for conditions
- `mcp__playwright__browser_snapshot` - Get accessibility tree snapshot
- `mcp__playwright__browser_close` - Close browser session

---

## General Testing Workflow

### 1. Navigate to Application
```
Tool: mcp__playwright__browser_navigate
URL: http://localhost:9000
```

### 2. Verify Page Load
- Check page snapshot for expected elements
- Verify page title is "Red Hat Quay • Quay"
- Confirm UI elements are visible

### 3. Interact with UI Elements
- **Click**: `mcp__playwright__browser_click`
- **Type**: `mcp__playwright__browser_type`
- **Fill Forms**: `mcp__playwright__browser_fill_form`
- **Take Snapshots**: `mcp__playwright__browser_snapshot`

### 4. Verify Results
- Check page state after interactions
- Verify URL changes for navigation
- Check console for errors: `mcp__playwright__browser_console_messages`

### 5. Clean Up
- Close browser when done: `mcp__playwright__browser_close`

---

## Common Test Scenarios

### Testing Navigation Items

**Testing Sidebar/Menu Navigation**
1. Navigate to the application
2. Use `browser_snapshot` to identify navigation elements
3. Click navigation items using their `ref` attribute
4. Verify URL change and page content
5. Check that active state is applied correctly

```yaml
Steps:
1. Navigate to http://localhost:9000
2. Snapshot to find navigation elements
3. Click element with ref (e.g., ref=e44)
4. Verify location.pathname matches expected route
5. Check for [active] attribute on clicked element
```

### Testing Expandable/Collapsible Sections

**Testing Accordion/Expandable UI Components**
1. Locate expandable button or trigger element
2. Click to expand - verify `[expanded]` state
3. Verify child elements appear in snapshot
4. Click again to collapse - verify child elements disappear
5. Verify collapse/expand state persists during navigation (if applicable)

```yaml
Key Attributes to Check:
- button "Section Name" [expanded] - when expanded
- button "Section Name" - when collapsed
- region "Section Name" - visible only when expanded
```

### Testing Auto-Expansion/State Management

**Testing Route-Based or Conditional UI State**
1. Navigate to a page where component should be in default state
2. Verify component is in expected default state
3. Navigate to or trigger condition that should change state
4. Verify component state changes as expected
5. Verify any child elements show correct states

### Testing Form Interactions

**Testing Forms and Input Fields**
1. Navigate to the relevant page
2. Click "Create" or "Edit" button if needed
3. Use `browser_fill_form` to fill multiple fields
4. Submit the form
5. Verify success message or navigation
6. Check for validation errors if applicable

### Testing Table/List Interactions

**Testing Data Tables and Lists**
1. Navigate to page with table/list
2. Verify table headers and columns render
3. Test sorting (click column headers)
4. Test pagination controls
5. Test search/filter functionality
6. Test row selection if applicable
7. Test row actions (edit, delete, etc.)

### Testing Modal/Dialog Interactions

**Testing Modals, Dialogs, and Overlays**
1. Click trigger button to open modal
2. Verify modal appears in snapshot
3. Test form fields or content within modal
4. Test close button or cancel action
5. Test submit/confirm action
6. Verify modal closes and state updates

### Testing Empty States

**Testing No-Data/Empty UI States**
1. Navigate to page expected to show empty state
2. Verify empty state message appears
3. Verify empty state icon/illustration (if applicable)
4. Verify CTA button is present (e.g., "Create First Item")
5. Test CTA button functionality

### Testing Loading States

**Testing Async Data Loading**
1. Navigate to page that loads data
2. Check snapshot for loading indicator
3. Wait for data to load (`browser_wait_for`)
4. Verify loading state disappears
5. Verify content renders correctly

---

## Element Identification

### Using Page Snapshots
Snapshots show accessibility tree structure:
```yaml
- button "Create Repository" [ref=e98] [cursor=pointer]
- link "Organizations" [active] [ref=e174] [cursor=pointer]
- checkbox "Select all" [ref=e76]
- textbox "Search input" [ref=e92]
- heading "Page Title" [level=1] [ref=e68]
```

### Key Attributes
- **ref**: Unique element reference for interaction
- **[active]**: Currently active navigation item or selected state
- **[expanded]**: Expandable section state
- **[disabled]**: Disabled interactive elements
- **[checked]**: Checkbox/toggle state
- **[cursor=pointer]**: Clickable elements
- **[level=N]**: Heading level for accessibility

### Element Description Format
When using Playwright tools, provide:
1. **element**: Human-readable description (e.g., "Create button")
2. **ref**: Exact reference from snapshot (e.g., "e174")

---

## Test Checklist Templates

### Navigation Component Testing
- [ ] Navigate to application
- [ ] Verify component renders
- [ ] Test expand/collapse (if applicable)
- [ ] Verify all navigation items present
- [ ] Test navigation to each route
- [ ] Verify active state highlighting
- [ ] Test state persistence (if applicable)
- [ ] Check browser console for errors
- [ ] Close browser session

### Page Component Testing
- [ ] Navigate to specific page
- [ ] Verify page title/heading
- [ ] Check for loading states
- [ ] Verify main content renders
- [ ] Test interactive elements (buttons, links)
- [ ] Verify empty states (if applicable)
- [ ] Test pagination (if applicable)
- [ ] Test search/filter functionality (if applicable)
- [ ] Check console for errors
- [ ] Close browser session

### Form Testing
- [ ] Navigate to form page
- [ ] Verify form fields present
- [ ] Fill form fields using browser_fill_form
- [ ] Test validation (invalid inputs)
- [ ] Submit form
- [ ] Verify success/error messages
- [ ] Check data persistence (if applicable)
- [ ] Test cancel/reset functionality
- [ ] Check console for errors
- [ ] Close browser session

### Table/List Testing
- [ ] Navigate to page with table/list
- [ ] Verify table renders with data
- [ ] Test column sorting
- [ ] Test pagination controls
- [ ] Test search/filter
- [ ] Test row selection
- [ ] Test row actions (expand, edit, delete)
- [ ] Verify empty state (if no data)
- [ ] Check console for errors
- [ ] Close browser session

### Modal/Dialog Testing
- [ ] Open modal/dialog
- [ ] Verify modal content renders
- [ ] Test form fields (if applicable)
- [ ] Test cancel/close button
- [ ] Test submit/confirm action
- [ ] Verify modal closes correctly
- [ ] Verify parent page state updates
- [ ] Check console for errors
- [ ] Close browser session

---

## Console Error Checking

### Check for Errors Only
```
Tool: mcp__playwright__browser_console_messages
Parameter: onlyErrors: true
```

### Check All Messages
```
Tool: mcp__playwright__browser_console_messages
(no parameters)
```

### Common Acceptable Messages
- `[INFO] [webpack-dev-server] Server started...` - Development server info
- `[LOG] [HMR] Waiting for update signal...` - Hot Module Replacement
- `[INFO] Download the React DevTools...` - React DevTools suggestion

### React Warnings to Note (Non-Critical)
- `Warning: Support for defaultProps will be removed...` - Deprecation warning

### Critical Errors to Report
- JavaScript errors (syntax, runtime)
- Network request failures (4xx, 5xx)
- React component errors
- Type errors or undefined references

---

## Example Test Report Template

```markdown
## Testing [Feature Name]

### Setup
1. Navigate to http://localhost:9000
2. Verify user is logged in
3. Navigate to relevant page: [URL]

### Test 1: [Test Description]
- Action: [What you did]
- Expected: [What should happen]
- Result: [What actually happened]
- Status: ✅ Pass / ❌ Fail

### Test 2: [Test Description]
- Action: [What you did]
- Expected: [What should happen]
- Result: [What actually happened]
- Status: ✅ Pass / ❌ Fail

[... more tests ...]

### Console Errors
- Run browser_console_messages(onlyErrors: true)
- Result: [No errors / List errors]
- Status: ✅ No errors / ❌ Errors found

### Cleanup
- Close browser

### Summary
[X] tests passed, [Y] tests failed
- [Brief summary of what works]
- [Brief summary of any issues found]
```

---

## Tips and Best Practices

### Performance
- Use `browser_snapshot` instead of `browser_take_screenshot` for interactions
- Take screenshots only for documentation purposes
- Avoid loading pages with large datasets if not necessary
- Close browser when done to free resources

### Reliability
- Always wait for page load before interactions
- Use exact `ref` attributes from snapshots
- Verify state changes after each interaction
- Check console regularly during test sessions
- Take fresh snapshots if element refs change

### Documentation
- Create detailed test reports with checkmarks
- Note any warnings or non-critical issues
- Include ref attributes in bug reports
- Document browser state at each step
- Include URLs and navigation paths

### Troubleshooting
- If element not found, take fresh snapshot
- Check for loading states before interacting
- Verify user has correct permissions for the feature
- Ensure application is running on correct port
- Check network tab for failed API calls if data doesn't load

---

## Common Playwright Tools Reference

### Navigation
```bash
# Navigate to URL
mcp__playwright__browser_navigate(url: "http://localhost:9000/path")

# Go back
mcp__playwright__browser_navigate_back()
```

### Interaction
```bash
# Click element
mcp__playwright__browser_click(element: "Button description", ref: "eXX")

# Type text
mcp__playwright__browser_type(element: "Input field", ref: "eXX", text: "value")

# Fill form with multiple fields
mcp__playwright__browser_fill_form(fields: [
  {name: "Field 1", type: "textbox", ref: "e1", value: "text"},
  {name: "Field 2", type: "checkbox", ref: "e2", value: "true"}
])

# Select dropdown option
mcp__playwright__browser_select_option(element: "Dropdown", ref: "eXX", values: ["option1"])

# Hover over element
mcp__playwright__browser_hover(element: "Element", ref: "eXX")
```

### Inspection
```bash
# Get page snapshot
mcp__playwright__browser_snapshot()

# Take screenshot
mcp__playwright__browser_take_screenshot()

# Get console messages
mcp__playwright__browser_console_messages(onlyErrors: true)

# Get network requests
mcp__playwright__browser_network_requests()
```

### Waiting
```bash
# Wait for specific time (seconds)
mcp__playwright__browser_wait_for(time: 2)

# Wait for text to appear
mcp__playwright__browser_wait_for(text: "Expected text")

# Wait for text to disappear
mcp__playwright__browser_wait_for(textGone: "Loading...")
```

### Session Management
```bash
# Close browser
mcp__playwright__browser_close()

# Manage tabs
mcp__playwright__browser_tabs(action: "list")
mcp__playwright__browser_tabs(action: "new")
mcp__playwright__browser_tabs(action: "close", index: 1)
mcp__playwright__browser_tabs(action: "select", index: 0)
```

---

## Quick Start Testing Workflow

```bash
# 1. Start testing
mcp__playwright__browser_navigate(url: "http://localhost:9000")

# 2. Get page structure
mcp__playwright__browser_snapshot()

# 3. Interact with elements (using refs from snapshot)
mcp__playwright__browser_click(element: "description", ref: "eXX")

# 4. Verify results
mcp__playwright__browser_snapshot()

# 5. Check for errors
mcp__playwright__browser_console_messages(onlyErrors: true)

# 6. Clean up
mcp__playwright__browser_close()
```

---

## References

- **Architecture**: `.claude/context/architecture.md`
- **React Standards & Patterns**: `.claude/context/react_standards.md`
- **Testing Patterns**: `.claude/context/testing_patterns.md`
- **Playwright MCP Documentation**: [Playwright Tools]

---

**Last Updated**: October 2025
