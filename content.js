// BizCloser Content Script - Production Quality
// This script runs on supported websites (Slack, Twilio dashboards, Aloware, etc.)
// to extract conversation threads for the BizCloser extension.

console.log("BizCloser content script loaded on:", window.location.href);

/**
 * Extracts conversation threads from the current page based on the hostname.
 * @returns {string|null} The extracted conversation thread as a single string, or null if not found.
 */
function extractConversationFromPage() {
  console.log("Extracting conversation from page...");

  if (window.location.hostname.includes("slack.com")) {
    return extractFromSlack();
  } else if (window.location.hostname.includes("twilio.com")) {
    return extractFromTwilio();
  } else if (window.location.hostname.includes("aloware.io")) {
    return extractFromAloware();
  } else {
    return extractGenericConversation();
  }
}

/**
 * Extracts messages from Slack's DOM.
 * @returns {string|null} Joined messages or null.
 */
function extractFromSlack() {
  console.log("Attempting Slack extraction...");
  
  // Slack's DOM structure can be complex and change. These selectors target message containers.
  const messageSelectors = [
    // Modern Slack message containers
    '[data-qa="virtual-list-item"]',
    '[data-qa="message_content"]',
    '.c-message_kit__message',
    '.c-message__body',
    '.p-message_pane__message',
    // Fallback selectors
    '[role="article"]',
    '.c-virtual_list__item',
    '.c-message_kit__blocks_for_browser'
  ];

  const messages = [];
  const seenTexts = new Set();
  
  for (const selector of messageSelectors) {
    try {
      const elements = document.querySelectorAll(selector);
      console.log(`Selector "${selector}" found ${elements.length} elements`);
      
      elements.forEach((el) => {
        // Extract text content
        let text = el.textContent?.trim();
        
        // Filter out very short or very long text
        if (text && text.length > 5 && text.length < 3000) {
          // Avoid duplicates
          if (!seenTexts.has(text)) {
            messages.push(text);
            seenTexts.add(text);
          }
        }
      });
    } catch (error) {
      console.error(`Error with selector "${selector}":`, error);
    }
  }

  console.log(`Slack extraction found ${messages.length} messages`);
  return messages.length > 0 ? messages.join("\n\n") : null;
}

/**
 * Extracts messages from Twilio's DOM.
 * @returns {string|null} Joined messages or null.
 */
function extractFromTwilio() {
  console.log("Attempting Twilio extraction...");
  
  // Twilio Console's message elements
  const messageSelectors = [
    // Modern Twilio selectors
    '[data-test-id="message-item"]',
    '.message-bubble',
    '.message-body',
    '.Twilio-Message-Bubble-Body',
    // Generic message containers
    '[role="listitem"]',
    '.sms-message',
    '.chat-message__body',
    '.message-content',
    '.message-item',
    // Fallback
    '[role="article"]'
  ];

  const messages = [];
  const seenTexts = new Set();
  
  for (const selector of messageSelectors) {
    try {
      const elements = document.querySelectorAll(selector);
      console.log(`Selector "${selector}" found ${elements.length} elements`);
      
      elements.forEach((el) => {
        let text = el.textContent?.trim();
        
        if (text && text.length > 5 && text.length < 3000) {
          if (!seenTexts.has(text)) {
            messages.push(text);
            seenTexts.add(text);
          }
        }
      });
    } catch (error) {
      console.error(`Error with selector "${selector}":`, error);
    }
  }

  console.log(`Twilio extraction found ${messages.length} messages`);
  return messages.length > 0 ? messages.join("\n\n") : null;
}

/**
 * Extracts messages from Aloware's DOM.
 * @returns {string|null} Joined messages or null.
 */
function extractFromAloware() {
  console.log("Attempting Aloware extraction...");

  const messageSelectors = [
    ".message-body",
    ".chat-message",
    ".message-content",
    "[data-testid='message']",
    ".conversation-container .message",
    ".thread-container .message",
    ".chat-container .message",
    ".messages .message"
  ];

  const messages = [];
  const seenTexts = new Set();

  for (const selector of messageSelectors) {
    try {
      const elements = document.querySelectorAll(selector);
      console.log(`Selector "${selector}" found ${elements.length} elements`);

      elements.forEach((el) => {
        let text = el.textContent?.trim();
        if (text && text.length > 5 && text.length < 3000 && !seenTexts.has(text)) {
          messages.push(text);
          seenTexts.add(text);
        }
      });
    } catch (error) {
      console.error(`Error with selector "${selector}":`, error);
    }
  }

  if (messages.length > 0) {
    console.log(`Aloware extraction found ${messages.length} messages`);
    return messages.join("\n\n");
  }

  const conversationContainer = document.querySelector(
    ".conversation-container, .thread-container, .chat-container, .messages"
  );
  if (conversationContainer) {
    const text = conversationContainer.textContent?.trim();
    if (text && text.length > 50) {
      console.log("Using Aloware container fallback");
      return text.substring(0, 2000);
    }
  }

  return null;
}

/**
 * Generic extraction for other messaging platforms.
 * @returns {string|null} Joined messages or null.
 */
function extractGenericConversation() {
  console.log("Attempting generic extraction...");
  
  const messageSelectors = [
    // ARIA roles for accessibility
    '[role="article"]',
    '[role="listitem"]',
    // Common message class names
    '.message',
    '.chat-message',
    '.conversation-item',
    '.bubble',
    '.text-message',
    '.msg',
    '.message-item',
    // Data attributes
    '[data-message-id]',
    '[data-msg-id]',
    // Attribute-based selectors
    '[class*="message"]',
    '[class*="chat"]',
    '[class*="msg"]'
  ];

  const messages = [];
  const seenTexts = new Set();
  
  for (const selector of messageSelectors) {
    try {
      const elements = document.querySelectorAll(selector);
      
      elements.forEach((el) => {
        let text = el.textContent?.trim();
        
        // Filter: reasonable length, avoid duplicates
        if (text && text.length > 10 && text.length < 3000) {
          if (!seenTexts.has(text)) {
            messages.push(text);
            seenTexts.add(text);
          }
        }
      });
    } catch (error) {
      console.error(`Error with selector "${selector}":`, error);
    }
  }

  if (messages.length > 0) {
    console.log(`Generic extraction found ${messages.length} messages`);
    return messages.join("\n\n");
  }

  // Fallback: try to get all text content from main content areas
  try {
    const mainContent = document.querySelector("main, #main, .main-content, .content, [role='main']");
    if (mainContent) {
      const text = mainContent.textContent?.trim();
      if (text && text.length > 50 && text.length < 10000) {
        console.log("Using main content fallback");
        return text;
      }
    }
  } catch (error) {
    console.error("Error accessing main content:", error);
  }

  console.log("No conversation found");
  return null;
}

// Listen for messages from popup or side panel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Content script received message:", request);
  
  if (request.action === "extractConversation" || request.action === "getConversationThread" || request.action === "getThread") {
    try {
      const conversation = extractConversationFromPage();
      
      if (conversation) {
        console.log("Successfully extracted conversation, length:", conversation.length);
        sendResponse({
          conversation: conversation,
          thread: conversation,
          success: true
        });
      } else {
        console.log("No conversation extracted");
        sendResponse({
          conversation: null,
          thread: null,
          success: false,
          error: "No conversation found on this page"
        });
      }
    } catch (error) {
      console.error("Error extracting conversation:", error);
      sendResponse({
        conversation: null,
        thread: null,
        success: false,
        error: error.message
      });
    }
  }
  
  // Return true to indicate we will send a response asynchronously
  return true;
});

// Initialize when DOM is ready
console.log("BizCloser content script initialized and listening for messages.");
