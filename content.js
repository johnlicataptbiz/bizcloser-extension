// BizCloser Content Script Skeleton
// This script will run on supported websites (Slack, Twilio dashboards, etc.)
// for future auto-scraping functionality

console.log('BizCloser content script loaded on:', window.location.href);

// Placeholder for auto-scraping functionality
// TODO: Implement DOM selectors and extraction logic for conversation threads

function detectConversationThread() {
    // Detect if current page contains a conversation thread
    // Specific selectors for each supported platform

    if (window.location.hostname.includes('aloware.io')) {
        // Aloware-specific detection and extraction
        console.log('Detected Aloware page');
        
        let conversationText = '';
        // Look for message containers in Aloware
        const messageContainers = document.querySelectorAll('.message-body, .chat-message, .message-content, [data-testid="message"]');
        
        if (messageContainers.length > 0) {
            conversationText = Array.from(messageContainers)
                .map(container => {
                    const messageDate = container.querySelector('.message-date, .timestamp')?.textContent || '';
                    const messageAuthor = container.querySelector('.message-author, .sender')?.textContent || 'Participant';
                    const messageContent = container.innerText.trim();
                    
                    if (messageContent) {
                        return `[${messageDate}] ${messageAuthor}: ${messageContent}`;
                    }
                    return messageContent;
                })
                .filter(text => text)
                .join('\n')
                .substring(0, 2000); // Limit length
        }

        // Alternative: look for conversation container
        if (!conversationText) {
            const conversationContainer = document.querySelector('.conversation-container, .thread-container, .chat-container, .messages');
            if (conversationContainer) {
                conversationText = conversationContainer.innerText.trim().substring(0, 2000);
            }
        }

        if (conversationText) {
            console.log('Aloware thread detected');
            return conversationText;
        }
        
        return null; // No conversation thread found
    }

    if (window.location.hostname.includes('slack.com')) {
        // Slack-specific detection and extraction
        console.log('Detected Slack page');
        
        let conversationText = '';
        const messageElements = document.querySelectorAll('.c-message__body');
        
        if (messageElements.length > 0) {
            conversationText = Array.from(messageElements)
                .map(msg => `[${msg.previousElementSibling?.textContent || ''}] ${msg.textContent}`)
                .join('\n')
                .substring(0, 2000);
        }

        if (conversationText) {
            console.log('Slack thread detected');
            return conversationText;
        }

        return null; // No conversation thread found on Slack
    }

    if (window.location.hostname.includes('twilio.com')) {
        // Twilio dashboard detection and extraction
        console.log('Detected Twilio dashboard');
        
        let conversationText = '';
        // Look for SMS thread in Twilio UI
        const smsElements = document.querySelectorAll('.sms-message, .message-content, [data-message-id]');
        
        if (smsElements.length > 0) {
            conversationText = Array.from(smsElements)
                .map(el => el.textContent)
                .join('\n')
                .substring(0, 2000);
        }
        
        if (conversationText) {
            console.log('Twilio thread detected');
            return conversationText;
        }
        
        return null; // No conversation thread found on Twilio
    }

    return null;
}

function injectAutoExtractButton() {
    // Placeholder: Add a button to the page for manual triggering
    // This could be used for testing before full automation

    const button = document.createElement('button');
    button.textContent = 'Auto Extract Thread (Coming Soon)';
    button.style.position = 'fixed';
    button.style.top = '10px';
    button.style.right = '10px';
    button.style.zIndex = '9999';
    button.style.padding = '8px 12px';
    button.style.backgroundColor = '#007bff';
    button.style.color = 'white';
    button.style.border = 'none';
    button.style.borderRadius = '4px';
    button.style.cursor = 'pointer';

    button.addEventListener('click', () => {
        const thread = detectConversationThread();
        if (thread) {
            // Send to side panel or background script
            chrome.runtime.sendMessage({
                action: 'extractedThread',
                thread: thread
            });
        } else {
            alert('No conversation thread detected on this page.');
        }
    });

    document.body.appendChild(button);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}

function initialize() {
    console.log('BizCloser content script initialized');
    // injectAutoExtractButton(); // Uncomment to add test button
}

// Listen for messages from popup or side panel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getThread' || request.action === 'getConversationThread') {
        const thread = detectConversationThread();
        sendResponse({ thread: thread });
    }
});