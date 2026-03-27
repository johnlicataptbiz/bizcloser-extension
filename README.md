# BizCloser Chrome Extension

A practical side panel extension for PT Biz lead setters. Users can paste a conversation thread and receive instant high-converting SMS replies that adhere strictly to PT Biz's proven messaging patterns.

## Features

- **Side Panel Interface**: Clean, modern UI for conversation input and reply generation
- **Smart Reply Generation**: AI-powered SMS reply generation using PT Biz's system prompt
- **Copy to Clipboard**: One-click copying with success notification
- **Reply History**: Automatically saves the last 5 generated replies using Chrome storage
- **Auto-Scrape Skeleton**: Placeholder code for future automatic thread extraction from Slack and SMS dashboards

## Installation

1. **Download or Clone**: Ensure you have the extension files in a local directory.

2. **Open Chrome Extensions**:
   - Open Google Chrome
   - Go to `chrome://extensions/`
   - Enable "Developer mode" in the top right corner

3. **Build and Load Unpacked Extension**:
   - Run `npm install` once if needed
   - Run `npm run build`
   - Click "Load unpacked"
   - Select the `/Users/jl/Developer/bizcloser/extension/` directory
   - The extension should now appear in your extensions list

4. **Open Side Panel**:
   - Navigate to any webpage
   - Click the extensions icon (puzzle piece) in the toolbar
   - Find "BizCloser" and click to open the side panel

## Usage

1. **Paste Conversation Thread**: Copy and paste the full SMS conversation thread into the large textarea.

2. **Generate Reply**: Click "Draft Reply" (or use auto-run after import) to send the thread to the backend API pipeline.

3. **Review Reply**: The generated SMS reply will appear in the output area.

4. **Copy Reply**: Click "Copy to Clipboard" to copy the reply to your clipboard with a success toast notification.

5. **Clear**: Use the "Clear" button to reset the input and output areas.

## Backend Integration

The extension calls `<base>/api/bizcloser/<route>` and tries backend targets in this order:

- A custom `backendUrl` saved in `chrome.storage.local`, if present
- `https://bizcloser-backend.vercel.app/api/bizcloser`
- `https://bizcloser-backend-bdm6kz35v-jack-licatas-projects.vercel.app/api/bizcloser`
- `http://localhost:3000/api/bizcloser`

The backend:

- Uses Postgres database to retrieve similar past booking examples
- Applies the BizCloser system prompt for reply generation
- Returns high-converting SMS replies

### Setting up the Backend

1. Navigate to the backend directory: `cd /Users/jl/Developer/bizcloser/backend/`
2. Install dependencies: `npm install`
3. Set up environment variables (see backend README)
4. Start the server: `npm start`

### Database validation

For schema, backfill, and monitoring guidance tied to `history_entries`, see [db/README.md](db/README.md), which includes the SQL snippet you mentioned plus Prisma/verification steps.

## Permissions

The extension requires the following permissions:
- `activeTab`: To interact with the current tab
- `sidePanel`: To display the side panel interface
- `storage`: To save reply history locally

## Content Scripts

The extension includes content scripts that run on:
- Slack (`https://*.slack.com/*`)
- Twilio dashboards (`https://app.twilio.com/*`, `https://dashboard.twilio.com/*`)

These are currently placeholders for future auto-scraping functionality.

## Development

### File Structure
```
/Users/jl/Developer/bizcloser/extension/
├── manifest.json          # Extension manifest
├── sidepanel.html         # Side panel HTML
├── sidepanel.css          # Custom styles
├── src/                   # TypeScript source files
├── dist/                  # Built extension files loaded by Chrome
└── README.md              # This file
```

### Technologies Used
- **Manifest V3**: Modern Chrome extension API
- **TypeScript + Webpack**: Bundled build for side panel, background, and content script
- **Custom CSS**: Hand-authored extension UI styling
- **Chrome Storage API**: For local data persistence

## Troubleshooting

- **Extension not loading**: Ensure all files are in the correct directory and try reloading the extension
- **API connection failed**: Reload the extension after `npm run build`, then confirm at least one configured backend is reachable
- **Side panel not opening**: Check that the extension is enabled and try refreshing the page

## Future Enhancements

- Automatic thread extraction from supported platforms
- Reply templates and customization options
- Integration with additional SMS platforms
- Advanced analytics and reply performance tracking

## License

This project is proprietary to PT Biz.
