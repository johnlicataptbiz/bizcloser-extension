---
name: chrome-extension-testing
description: Automated testing of Chrome extensions using browser automation tools. Tests extension loading, UI functionality, API integration, and user workflows. Use when you need to programmatically test Chrome extension behavior, verify Manifest V3 compliance, or automate extension QA processes.
---

# Chrome Extension Testing

## When to use

Use this skill when you need to:
- Test Chrome extension loading and functionality programmatically
- Verify extension UI components and user interactions
- Test API integrations and network requests
- Automate extension testing workflows
- Check for runtime errors and console issues
- Validate extension behavior across different scenarios

## When NOT to use

Do not use this skill for:
- Manual testing that requires human judgment
- Testing extensions that require user authentication or manual setup
- Performance testing or load testing
- Security testing or penetration testing

## Workflow

1. **Setup Test Environment**
   - Execute the test script: `node scripts/test-extension.js [extension-path]`
   - The script launches Chrome with the extension loaded
   - Verifies extension appears in chrome://extensions
   - Checks for console errors during loading

2. **Automated Test Execution**
   - Manifest validation and structure checking
   - File validation (HTML, JS, CSS integrity)
   - Extension loading verification
   - Side panel opening capability
   - UI element presence verification
   - API integration and reply generation testing
   - Error handling validation
   - Console error detection

3. **Review Test Results**
   - Script outputs detailed test report
   - Shows passed/failed/error counts
   - Lists specific issues found

4. **Manual Testing (if needed)**
   - For complex UI interactions not covered by automation
   - Accessibility testing
   - Cross-browser compatibility

## Prerequisites

- Chrome browser installed
- Node.js and npm installed
- Puppeteer: `npm install puppeteer`
- Extension files in accessible directory
- Backend services running (if applicable)
- Network access for API testing

## Files

- `scripts/test-extension.js`: Main test script using Puppeteer for automated testing
- Execute with: `node scripts/test-extension.js [path-to-extension-directory]`

## Examples

### Basic Extension Loading Test
Test that an extension loads without errors and appears in the extensions list.

### UI Functionality Test
Verify that extension popup opens, forms work, and buttons respond correctly.

### API Integration Test
Test that extension makes correct API calls and handles responses properly.

## Troubleshooting

- **Extension won't load**: Check manifest.json syntax and file paths
- **UI elements not found**: Verify selectors match current HTML structure
- **API calls fail**: Ensure backend services are running and accessible
- **Automation timeouts**: Increase wait times for slow-loading elements