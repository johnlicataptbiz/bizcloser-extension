// BizCloser Background Service Worker
// Opens the side panel when the extension action (toolbar button) is clicked.

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('BizCloser: setPanelBehavior failed:', error));

// Listen for messages from the side panel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'generateReply') {
    handleGenerateReply(request.thread, request.prompt)
      .then((data) => {
        sendResponse({ data: data });
      })
      .catch((error) => {
        console.error('Background script error:', error);
        sendResponse({ error: error.message });
      });
    // Return true to indicate we will send a response asynchronously
    return true;
  }
});

/**
 * Proxy function to fetch reply generation from the backend.
 * This bypasses CORS restrictions by making the request from the background script,
 * which has broader permissions than the side panel.
 */
async function handleGenerateReply(thread, prompt) {
  try {
    const response = await fetch('https://bizcloser-backend-bdm6kz35v-jack-licatas-projects.vercel.app/api/bizcloser/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        thread: thread,
        prompt: prompt
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data.reply) {
      throw new Error('No reply generated');
    }
    return data;
  } catch (error) {
    console.error('Backend request failed:', error);
    throw new Error(`Failed to connect to backend: ${error.message}`);
  }
}
