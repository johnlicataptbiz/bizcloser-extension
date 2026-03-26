# BizCloser Chrome Extension

A Chrome extension that helps PT Biz lead setters turn real conversations into polished replies using AI. The extension provides a side panel for importing threads from supported platforms and generating responses through the backend.

## Features

- **Side Panel Interface**: Clean, accessible UI for conversation handling
- **Conversation Import**: Pull threads from Slack and Twilio
- **AI-Powered Reply Generation**: Generate polished SMS responses
- **TypeScript**: Full type safety and modern development practices
- **Accessibility**: WCAG compliant with proper ARIA labels and keyboard navigation
- **Security**: Content Security Policy and secure API communication
- **Performance**: Optimized bundle size and efficient async operations

## Architecture

### Manifest V3 Compliance
- Service Worker background script
- Secure cross-origin communication
- Content Security Policy implementation

### Component Structure
```
src/
├── background.ts      # Service worker for API proxying
├── content.ts         # Content script for conversation extraction
├── sidepanel.ts       # Main UI application
├── api.ts            # Backend API client
└── logger.ts         # Logging utility

types/
└── index.ts          # TypeScript type definitions

test/
├── logger.test.ts    # Unit tests
└── setup.ts         # Test configuration
```

## Development

### Prerequisites
- Node.js 18+
- npm or yarn

### Setup
```bash
# Install dependencies
npm install

# Development build with watch mode
npm run dev

# Production build
npm run build

# Type checking
npm run type-check

# Run tests
npm test
```

### Building for Chrome
1. Run `npm run build` to create the `dist/` folder
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the `dist/` folder

## Usage

1. **Install the extension** following the build steps above
2. **Open a supported platform** (Slack or Twilio) in a tab
3. **Click the extension icon** to open the side panel
4. **Import conversation** using the conversation button
5. **Generate reply** by clicking "Generate Reply"
6. **Copy the reply** and paste it into your messaging platform

## Supported Platforms

- **Slack**: `https://*.slack.com/*`
- **Twilio**: `https://app.twilio.com/*`, `https://dashboard.twilio.com/*`

## Security

- **Content Security Policy**: Restricts script sources to prevent XSS
- **Host Permissions**: Limited to necessary domains only
- **API Communication**: All requests proxy through the background service worker
- **Data Handling**: Reply state stays local to the active session

## Accessibility

- **WCAG 2.1 AA Compliance**: Proper ARIA labels, roles, and states
- **Keyboard Navigation**: Full keyboard accessibility
- **Screen Reader Support**: Semantic HTML and ARIA announcements
- **Focus Management**: Logical tab order and focus indicators

## Testing

```bash
# Run all tests
npm test

# Run tests with UI
npm run test:ui

# Run tests once (CI mode)
npm run test:run
```

## API Integration

The extension communicates with the BizCloser backend API:

- **Endpoint**: `https://bizcloser-backend-bdm6kz35v-jack-licatas-projects.vercel.app/api/bizcloser/generate`
- **Method**: POST
- **Payload**: `{ thread: string }`
- **Response**: `{ reply: string, ... }`

The backend owns the system prompt and reply-generation policy, so the client only sends the conversation thread.

## Development Guidelines

### Code Style
- **TypeScript**: Strict type checking enabled
- **Functional Programming**: Prefer pure functions and immutability
- **Error Handling**: Comprehensive try-catch with custom error types
- **Logging**: Structured logging with context

### Chrome Extension Best Practices
- **Manifest V3**: Modern extension APIs only
- **Permissions**: Principle of least privilege
- **Performance**: Minimize background script activity
- **Security**: Validate all inputs and sanitize outputs

## Troubleshooting

### Common Issues

**Extension not loading:**
- Ensure you're loading the `dist/` folder, not the root
- Check console for TypeScript compilation errors

**Conversation import fails:**
- Verify you're on a supported platform
- Check content script permissions in manifest.json

**API requests fail:**
- Confirm backend is running and accessible
- Check network tab for CORS or connectivity issues

### Debug Mode
Set `NODE_ENV=development` for enhanced logging:
```bash
NODE_ENV=development npm run dev
```

## Contributing

1. Follow the existing code style and architecture
2. Add tests for new functionality
3. Update documentation for API changes
4. Ensure accessibility compliance

## License

This project is part of the BizCloser application suite.
