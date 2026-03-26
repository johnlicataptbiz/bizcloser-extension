// BizCloser Side Panel JavaScript - Production Quality

document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const threadForm = document.getElementById('threadForm');
    const threadInput = document.getElementById('threadInput');
    const generateBtn = document.getElementById('generateBtn');
    const importBtn = document.getElementById('importBtn');
    const loading = document.getElementById('loading');
    const errorState = document.getElementById('errorState');
    const errorMessage = document.getElementById('errorMessage');
    const retryBtn = document.getElementById('retryBtn');
    const replyOutput = document.getElementById('replyOutput');
    const replyContent = document.getElementById('replyContent');
    const copyBtn = document.getElementById('copyBtn');
    const clearBtn = document.getElementById('clearBtn');
    const toast = document.getElementById('toast');

    // State management
    let currentReply = '';
    let isGenerating = false;

    // BizCloser system prompt (truncated for brevity in code)
    const bizCloserPrompt = `You are BizCloser, a specialized assistant that writes high converting SMS replies for PT Biz leads.

Your job is to generate outbound and inbound SMS responses that closely mirror the structure, pacing, psychology, sequencing, and CTA mechanics used in PT Biz conversion messaging, especially the booked call examples.

Core objective:
Qualify quickly, sound human, and book strategy calls with strong structural fidelity to proven PT Biz call setting messages.

Primary operating rules

1. Structural fidelity over stylistic preference
When positioning a strategy call, closely mirror the proven PT Biz booked call message structure.
The sentence order, pacing, momentum, and CTA flow should feel nearly identical to top performing examples.
Do not freestyle the call pitch if a proven structure is available.

2. SMS formatting rules
Messages must read like real text conversations.
Use one paragraph for shorter replies.
Use a maximum of two paragraphs for longer replies.
Never use stacked one sentence paragraphs.
If a message must be split for SMS length, each message should still read like a natural paragraph.

3. Human texting style
Sound like a real person texting a clinic owner.
Use casual, conversational language with energy.
Regularly use natural reactions like:
Love it!!
Nice!!
Gotcha!
Makes sense tbh
Totally get that
Haha yeah that happens a lot

Use texting punctuation naturally, especially:
!!
!?

You may use light texting acronyms when natural:
rn, tbh, btw, imo, lol

Avoid sounding stiff, corporate, robotic, or overly polished.

4. Mid thread awareness
Assume the conversation is already in progress unless clearly starting fresh.
Do not repeatedly open with "Hey [Name]".
Instead, respond like you are continuing an active thread.

5. Thread parsing
When given a conversation log, read the full thread before replying.
Reconstruct the conversation state from the entire exchange, not just the last message.
Extract and track:
niche or patient population
payor mix
delivery model
ownership status
timeline
growth friction
questions already asked

Never repeat questions that were already asked earlier unless the lead clearly ignored them.

6. Qualification variables
Before positioning a strategy call, determine whether these are known or reasonably inferable:

a. niche or population served
b. payor mix: cash, insurance, or hybrid
c. delivery model: brick and mortar, mobile, virtual, or hybrid
d. ownership status: owner, employee, side hustle, planning stage

If fewer than 3 are known, ask a compression qualifier.

Example compression qualifier:
"what kind of patients are you mainly working with and are you seeing them in person, mobile, or virtual rn?"

If exactly 3 are known, ask only for the final missing variable.

7. Core fit rules
PT Biz core clients are:
licensed PTs
chiropractors
athletic trainers
rehab clinicians

They should be building or planning a cash or hybrid practice.

If the lead is clearly outside that group, do not pitch a strategy call.
Instead, politely redirect or keep the conversation warm if there is still ambiguity.

If there is uncertainty, do not disqualify too early.
Ask one clarifying question before redirecting.

8. Call readiness signals
Only position a strategy call when all 4 qualification variables are known and at least 2 of the following are present:
timeline within 12 months
clear cash based intent
operational friction or scaling problem
strong engagement in the thread
growth, conversion, pricing, hiring, or expansion questions

9. Podcast or nurture safeguard
If the lead signals low urgency or distant intent with language like:
"maybe someday"
"1 to 2 years"
"just researching"
do not pitch a call.
Instead send a relevant resource or keep the conversation open.

10. Role boundaries
You are a lead setter, not a coach or strategist.
Do not provide tactical business consulting, detailed breakdowns, or step by step strategy.
Briefly frame the situation, then move toward qualification or a call.

11. Call invitation structure
When it is time to pitch a strategy call, follow this sequence:

1. enthusiastic acknowledgment
2. brief validation of their situation
3. explain that this is exactly what gets mapped out on a strategy call
4. mention that the training is specialized for cash based practices
5. reassure them that clarity would help even if they do not move forward
6. ask scheduling preference using weekdays and AM or PM

The call pitch should feel natural, confident, and momentum driven.
It should resemble proven PT Biz booked call texts as closely as possible.

12. Statistics rule
Only use the statistics "9 out of 10" and "83%" if they appear exactly as written in approved PT Biz examples.
Do not invent or modify stats.

13. Style restrictions
Never use em dashes.
Never use hyphens as a stylistic separator.
Keep the writing natural and easy to text.

Response behavior

When given a lead reply or full thread:
1. read the whole exchange
2. determine conversation stage
3. identify known qualification variables
4. decide whether to:
   ask a compression question
   ask for the final missing variable
   softly redirect
   keep warm with clarification
   position a strategy call
5. produce only the SMS reply unless asked for explanation

Output standard
Default output should be just the text message to send.
No quotation marks.
No labels unless requested.
Keep it sounding like a real person mid conversation.`;

    // Initialize
    initializeApp();

    function initializeApp() {
        setupEventListeners();
        setupKeyboardNavigation();
        updateUIState('empty');
    }

    function setupEventListeners() {
        // Form submission
        threadForm.addEventListener('submit', handleFormSubmit);

        // Button clicks
        importBtn.addEventListener('click', handleImportClick);
        copyBtn.addEventListener('click', handleCopyClick);
        clearBtn.addEventListener('click', handleClearClick);
        retryBtn.addEventListener('click', handleRetryClick);

        // Input validation
        threadInput.addEventListener('input', handleInputChange);
    }

    function setupKeyboardNavigation() {
        // Ensure proper tab order and keyboard accessibility
        document.addEventListener('keydown', function(e) {
            // Close error state with Escape
            if (e.key === 'Escape' && !errorState.classList.contains('hidden')) {
                hideErrorState();
            }
        });
    }

    function handleFormSubmit(e) {
        e.preventDefault();
        const thread = threadInput.value.trim();

        if (!thread) {
            showError('Please enter a conversation thread');
            threadInput.focus();
            return;
        }

        if (isGenerating) return;

        generateReply(thread);
    }

    async function generateReply(thread) {
        isGenerating = true;
        updateUIState('loading');
        hideErrorState();

        try {
            const response = await fetch('http://localhost:3000/api/bizcloser/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    thread: thread,
                    prompt: bizCloserPrompt
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

            currentReply = data.reply;
            displayReply(data.reply);
            updateUIState('success');

            // Save to storage
            await saveReply(data.reply);

        } catch (error) {
            console.error('Generation error:', error);
            const message = error.message || 'Failed to generate reply. Please try again.';
            showError(message);
            updateUIState('error');
        } finally {
            isGenerating = false;
        }
    }

    function displayReply(reply) {
        replyContent.textContent = reply;
        replyOutput.classList.remove('hidden');
        copyBtn.focus(); // Move focus to copy button for accessibility
    }

    async function handleCopyClick() {
        if (!currentReply) return;

        try {
            await navigator.clipboard.writeText(currentReply);
            showToast('Copied to clipboard!');
        } catch (error) {
            console.error('Clipboard error:', error);
            // Fallback for older browsers
            fallbackCopyToClipboard(currentReply);
        }
    }

    function fallbackCopyToClipboard(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
            document.execCommand('copy');
            showToast('Copied to clipboard!');
        } catch (error) {
            console.error('Fallback copy failed:', error);
            showToast('Copy failed. Please select and copy manually.');
        } finally {
            document.body.removeChild(textArea);
        }
    }

    function handleClearClick() {
        if (confirm('Clear all content? This cannot be undone.')) {
            clearAll();
        }
    }

    function handleRetryClick() {
        hideErrorState();
        const thread = threadInput.value.trim();
        if (thread) {
            generateReply(thread);
        } else {
            threadInput.focus();
        }
    }

    async function handleImportClick() {
        importBtn.disabled = true;
        const originalButtonText = importBtn.textContent;
        importBtn.textContent = 'Importing...';

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab.url || !tab.url.match(/^https?:\/\//)) {
                throw new Error('Cannot access current tab');
            }

            // First check if there's highlighted text
            const result = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: getSelectedText
            });

            const selectedText = result[0].result;
            if (selectedText && selectedText.trim() !== '') {
                threadInput.value = selectedText.trim();
                updateToast('Imported selected text');
                return;
            }

            // Check if the content script has thread extraction ability
            // First try to get conversation from content script if it exists
            chrome.tabs.sendMessage(
                tab.id,
                { action: 'getConversationThread' },
                (response) => {
                    if (chrome.runtime.lastError) {
                        // If content script isn't available for this URL, try common selectors
                        const fallbackResult = chrome.scripting.executeScript({
                            target: { tabId: tab.id },
                            func: extractFallbackThread
                        }).then(fallbackResponse => {
                            const thread = fallbackResponse[0]?.result || 'No conversation thread detected on this page.';
                            threadInput.value = thread;
                            updateToast('Imported conversation');
                        }).catch(() => {
                            threadInput.value = 'Could not extract conversation from this page. Select text manually.';
                            updateToast('Import failed - Please select text to import');
                        });
                    } else if (response?.thread) {
                        threadInput.value = response.thread;
                        updateToast('Imported conversation');
                    } else {
                        threadInput.value = 'No conversation thread detected on this page.';
                        updateToast('No conversation detected');
                    }
                }
            );
        } catch (error) {
            console.error('Import error:', error);
            threadInput.value = 'Import failed: ' + error.message;
            updateToast('Import failed - Check console for details');
        } finally {
            setTimeout(() => {
                importBtn.disabled = false;
                importBtn.textContent = originalButtonText;
            }, 1000);
        }
    }

    // Helper functions for content extraction
    function getSelectedText() {
        return window.getSelection().toString();
    }

    function extractFallbackThread() {
        // Common selectors for conversation threads on various platforms
        let conversationText = '';

        // Try to find common conversation/communication containers
        const selectors = [
            '[data-testid*="conversation"]',
            '[data-testid*="thread"]',
            '[class*="conversation"]',
            '[class*="thread"]',
            '[class*="chat"]',
            '[class*="message"]',
            '.communication-container',
            '.msg-content',
            '.messagelist',
            '[role="log"]'
        ];

        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
                const texts = Array.from(elements).map(el => el.innerText).filter(Boolean);
                if (texts.length > 0) {
                    conversationText = texts.join('\n\n');
                    break;
                }
            }
        }

        if (!conversationText) {
            // Last resort: try to grab all text content that looks like a conversation
            const allElements = document.querySelectorAll('div, p, span, li');
            const potentialConversation = Array.from(allElements)
                .filter(element => {
                    const text = element.innerText;
                    return text.length > 30 && 
                           (text.includes(':') || text.includes('\n')) &&
                           text.split('\n').length >= 2;
                })
                .slice(0, 10)
                .map(el => el.innerText)
                .join('\n\n');
                
            if (potentialConversation.length > 50) {
                conversationText = potentialConversation;
            }
        }

        return conversationText.substring(0, 2000); // Limit to prevent huge text
    }

    function handleInputChange() {
        const hasContent = threadInput.value.trim().length > 0;
        generateBtn.disabled = !hasContent || isGenerating;

        if (!hasContent && !currentReply) {
            updateUIState('empty');
        }
    }

    function clearAll() {
        threadInput.value = '';
        currentReply = '';
        updateUIState('empty');
        threadInput.focus();
    }

    function updateUIState(state) {
        // Hide all states
        loading.classList.add('hidden');
        errorState.classList.add('hidden');
        replyOutput.classList.add('hidden');
        document.getElementById('emptyState').classList.add('hidden');

        // Show relevant state
        switch (state) {
            case 'loading':
                loading.classList.remove('hidden');
                generateBtn.disabled = true;
                break;
            case 'error':
                errorState.classList.remove('hidden');
                generateBtn.disabled = false;
                break;
            case 'success':
                replyOutput.classList.remove('hidden');
                generateBtn.disabled = false;
                break;
            case 'empty':
            default:
                document.getElementById('emptyState').classList.remove('hidden');
                generateBtn.disabled = true;
                break;
        }
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorState.classList.remove('hidden');
        retryBtn.focus();
    }

    function hideErrorState() {
        errorState.classList.add('hidden');
    }

    function showToast(message) {
        toast.textContent = message;
        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    function updateToast(message) {
        toast.textContent = message;
        toast.classList.add('show');

        // Auto remove after 3 seconds
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    async function saveReply(reply) {
        try {
            const result = await chrome.storage.local.get(['replies']);
            let replies = result.replies || [];
            replies.unshift(reply);
            replies = replies.slice(0, 5); // Keep only last 5
            await chrome.storage.local.set({ replies });
        } catch (error) {
            console.error('Failed to save reply:', error);
            // Non-critical error, don't show to user
        }
    }
});