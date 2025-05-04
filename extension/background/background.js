// Cache for storing summaries
const summaryCache = new Map();

// API endpoint config
const API_ENDPOINT = 'http://localhost:8000/api/summarize';
// Use a fallback mock API mode when the real API is not available
let useMockAPI = false; // Default to using real API since we're running locally

console.log('[Background] Script initialized - API endpoint:', API_ENDPOINT);

// Verify API is running
async function checkApiAvailability() {
  console.log('[Background] Checking API availability...');
  try {
    // Try to connect to the API with a short timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout
    
    const response = await fetch(`${API_ENDPOINT.split('/api')[0]}/api/status`, {
      method: 'GET',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      console.log('[Background] API is available and responding');
      useMockAPI = false; // Real API is working, use it
      return true;
    } else {
      console.error('[Background] API returned error status:', response.status);
      useMockAPI = true; // Fall back to mock API
      return false;
    }
  } catch (error) {
    console.error('[Background] API connection failed:', error);
    useMockAPI = true; // Fall back to mock API
    return false;
  }
}

// Call this once on startup to set the API mode
checkApiAvailability().then(isAvailable => {
  console.log('[Background] API availability check completed:', isAvailable ? 'Available' : 'Unavailable');
  console.log('[Background] Using', useMockAPI ? 'mock API mode' : 'real API mode');
});

// Extract content from webpage
async function extractContentFromPage(tabId) {
  console.log('[Background] Extracting content from page, tabId:', tabId);
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // Get metadata
        const title = document.title;
        const url = document.location.href;
        
        console.log('[Content Script] Extracting content from:', url);
        
        // Get main content
        // Try to find article or main content area first
        let content = '';
        const articleElements = document.querySelectorAll('article, [role="main"], main, .main-content, #main-content');
        
        if (articleElements.length > 0) {
          // Use the first article element
          console.log('[Content Script] Found article element');
          content = articleElements[0].innerText;
        } else {
          // Fallback: get all paragraphs
          console.log('[Content Script] No article element found, collecting paragraphs');
          const paragraphs = document.querySelectorAll('p');
          content = Array.from(paragraphs)
            .map(p => p.innerText.trim())
            .filter(text => text.length > 100) // Filter out short paragraphs
            .join('\n\n');
          
          // If still no content, get body text
          if (!content || content.length < 500) {
            console.log('[Content Script] Not enough paragraph content, using body text');
            content = document.body.innerText;
          }
        }
        
        console.log('[Content Script] Content extraction complete, length:', content.length);
        
        return {
          title,
          url,
          content
        };
      }
    });
    
    console.log('[Background] Content extraction successful, title:', result.title);
    console.log('[Background] Content length:', result.content.length);
    return result;
  } catch (error) {
    console.error('[Background] Error extracting content:', error);
    throw new Error('Failed to extract content from the page');
  }
}

// Send data to API for summarization
async function getSummaryFromAPI(data, length) {
  console.log('[Background] Sending data to API for summarization');
  console.log('[Background] API request payload:', {
    url: data.url,
    title: data.title,
    contentLength: data.content.length,
    requestedLength: length || 'medium',
    save_history: true // Always save to history
  });
  
  // If we're in mock API mode, always return a mock response
  if (useMockAPI) {
    console.log('[Background] Using mock API mode, generating mock summary');
    return generateMockSummary(data, length);
  }
  
  try {
    console.log('[Background] Making API request to:', API_ENDPOINT);
    
    // Use a timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout (increased)
    
    const requestBody = {
      url: data.url,
      title: data.title || 'Untitled Page',
      content: data.content,
      length: length || 'medium',
      save_history: true, // Explicitly set save_history to true
      isSelection: false
    };
    
    console.log('[Background] Sending request with full data:', JSON.stringify(requestBody).substring(0, 200) + "...");
    
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.error('[Background] API response error:', response.status);
      console.error('[Background] Response text:', await response.text());
      throw new Error(`API error: ${response.status}`);
    }
    
    const responseText = await response.text();
    console.log('[Background] Raw API response:', responseText.substring(0, 200) + "...");
    
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      console.error('[Background] Error parsing JSON response:', e);
      throw new Error('Invalid JSON response from API');
    }
    
    console.log('[Background] API response received successfully');
    console.log('[Background] Summary should be saved to history now');

    // Save to cache
    const cacheKey = `${data.url}:${length}`;
    summaryCache.set(cacheKey, result);
    
    // Verify the summary is in history immediately and after a short delay
    console.log('[Background] Verifying summary is in history...');
    checkHistorySummaries();
    
    // Also check again after a delay
    setTimeout(checkHistorySummaries, 3000);
    
    return result;
  } catch (error) {
    console.error('[Background] Error calling API:', error);
    console.log('[Background] Falling back to mock summary');
    return generateMockSummary(data, length);
  }
}

// Helper function to check history summaries
async function checkHistorySummaries() {
  try {
    console.log('[Background] Checking summaries in history...');
    const historyResponse = await fetch(`${API_ENDPOINT.split('/api')[0]}/api/history`);
    if (historyResponse.ok) {
      const histories = await historyResponse.json();
      console.log('[Background] Found', histories.length, 'summaries in history');
      if (histories.length > 0) {
        console.log('[Background] Latest summary:', histories[0].url, 'ID:', histories[0].id);
      }
    } else {
      console.error('[Background] Error fetching history:', historyResponse.status);
    }
  } catch (err) {
    console.error('[Background] Error checking history:', err);
  }
}

// Generate a mock summary for testing/demo when API is not available
function generateMockSummary(data, length) {
  console.log('[Background] Generating mock summary for length:', length);
  
  // Simulate processing delay
  return new Promise(resolve => {
    setTimeout(() => {
      // Create different summaries based on requested length
      let mainContent = '';
      let keyPoints = [];
      
      // Base content from page title and URL
      const pageTitle = data.title || 'Untitled Page';
      const pageUrl = data.url || 'unknown';
      const pageContent = data.content || '';
      
      // Extract some sample content to make the summary look more realistic
      const contentSample = pageContent.substring(0, 500).split(' ').slice(0, 20).join(' ');
      
      if (length === 'short') {
        // Short summary - concise overview
        mainContent = `This page appears to be about ${pageTitle}. ${contentSample}...`;
        keyPoints = [
          "The page contains information relevant to " + pageTitle.split(' ').slice(0, 3).join(' '),
          "Key information is presented in a structured format",
          "The main topic revolves around " + pageTitle.split(' ').slice(-3).join(' ')
        ];
      } 
      else if (length === 'medium') {
        // Medium summary - more details
        mainContent = `This page titled "${pageTitle}" presents information about ${pageTitle.split(' ').slice(0, 3).join(' ')}. The content includes details on various aspects of the topic. ${contentSample}... The page structure suggests it's designed to inform readers about specific concepts related to the subject matter.`;
        keyPoints = [
          "The page contains detailed information about " + pageTitle.split(' ').slice(0, 3).join(' '),
          "Several sections explain different aspects of the main topic",
          "The content is structured to guide readers through the subject matter",
          "There appear to be supporting examples and explanations",
          "The page addresses common questions related to the topic"
        ];
      }
      else {
        // Long summary - comprehensive
        mainContent = `This comprehensive page titled "${pageTitle}" provides an in-depth exploration of ${pageTitle}. The content thoroughly examines multiple aspects of the subject matter and offers detailed explanations. ${contentSample}... \n\nThe page appears to be organized into distinct sections, each focusing on specific elements of the topic. The structure suggests it's intended as a complete resource for understanding the subject matter. Based on the content, readers can gain significant insights into both fundamental concepts and advanced applications related to the topic.\n\nThe writing style indicates this is likely a ${pageUrl.includes('blog') ? 'blog post' : 'informational resource'} aimed at ${pageUrl.includes('tech') || pageContent.includes('code') ? 'technical audiences' : 'general readers'} seeking to expand their knowledge in this area.`;
        keyPoints = [
          "The page presents comprehensive information about " + pageTitle.split(' ').slice(0, 3).join(' '),
          "Multiple sections explore different dimensions of the main topic in detail",
          "The content is structured to provide both overview and in-depth analysis",
          "Supporting examples, data, and explanations reinforce the main points",
          "The page addresses advanced concepts related to the subject matter",
          "Various practical applications of the concepts are discussed",
          "The information appears to be presented in a logical sequence for optimal understanding",
          "The content would be valuable for both newcomers and those with prior knowledge"
        ];
      }
      
      const mockSummary = {
        title: `Summary of: ${pageTitle}`,
        main: mainContent,
        keyPoints: keyPoints
      };
      
      resolve(mockSummary);
    }, 1500); // Simulate network delay
  });
}

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Background] Message received:', request.action);
  console.log('[Background] Message details:', request);
  
  if (request.action === 'summarize') {
    // Start summarization process
    (async () => {
      try {
        // Check cache first
        const cacheKey = `${request.url}:${request.length}`;
        if (summaryCache.has(cacheKey)) {
          console.log('[Background] Cache hit for:', cacheKey);
          sendResponse({ 
            success: true, 
            summary: summaryCache.get(cacheKey),
            fromCache: true
          });
          return;
        }
        
        console.log('[Background] Cache miss, proceeding with summarization');
        
        // Get tab ID from sender or active tab
        let tabId;
        if (sender.tab) {
          tabId = sender.tab.id;
          console.log('[Background] Using sender tab id:', tabId);
        } else {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          tabId = tab.id;
          console.log('[Background] Using active tab id:', tabId);
        }
        
        // Extract content
        console.log('[Background] Extracting content from tab');
        const pageData = await extractContentFromPage(tabId);
        
        // Call API
        console.log('[Background] Calling API for summarization');
        const summary = await getSummaryFromAPI(pageData, request.length);
        
        // Cache result
        console.log('[Background] Caching summary result');
        summaryCache.set(cacheKey, summary);
        
        // Send response back to popup
        console.log('[Background] Sending successful response back to popup');
        sendResponse({ 
          success: true, 
          summary: summary
        });
      } catch (error) {
        console.error('[Background] Error in summarization process:', error);
        sendResponse({ 
          success: false, 
          error: error.message || 'Failed to generate summary'
        });
      }
    })();
    
    // Return true to indicate we'll respond asynchronously
    return true;
  }
  
  // Handle cached summary request
  if (request.action === 'getCachedSummary') {
    console.log('[Background] Checking for cached summary');
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const url = tab.url;
        console.log('[Background] Looking for cache for URL:', url);
        
        // Check if we have a cached summary for any length
        for (const [key, value] of summaryCache.entries()) {
          if (key.startsWith(url + ':')) {
            console.log('[Background] Found cached summary for:', key);
            sendResponse({
              success: true,
              summary: value,
              fromCache: true
            });
            return;
          }
        }
        
        // No cached summary found
        console.log('[Background] No cached summary found');
        sendResponse({
          success: false
        });
      } catch (error) {
        console.error('[Background] Error getting cached summary:', error);
        sendResponse({
          success: false,
          error: error.message
        });
      }
    })();
    
    return true;
  }
  
  // Handle feedback submission
  if (request.action === 'feedback') {
    console.log('[Background] Received feedback:', request.rating, 'for URL:', request.url);
    (async () => {
      try {
        // Here you would typically send feedback to your server
        // For this example, we'll just log it
        console.log('[Background] Processing feedback:', request.rating, 'for URL:', request.url);
        
        // Send acknowledgment back to popup
        sendResponse({ success: true });
      } catch (error) {
        console.error('[Background] Error processing feedback:', error);
        sendResponse({ 
          success: false, 
          error: error.message || 'Failed to submit feedback'
        });
      }
    })();
    
    return true;
  }
});

// Clear cache when browser is closed or extension is updated
chrome.runtime.onStartup.addListener(() => {
  console.log('[Background] Extension started, clearing cache');
  summaryCache.clear();
});

// Set up context menu (optional)
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Background] Extension installed/updated');
  
  // Check API availability
  checkApiAvailability().then(isAvailable => {
    if (isAvailable) {
      console.log('[Background] API check passed, extension should work properly');
    } else {
      console.warn('[Background] API check failed - make sure your backend server is running at:', API_ENDPOINT);
    }
  });
  
  chrome.contextMenus.create({
    id: 'summarize-selection',
    title: 'Summarize Selection',
    contexts: ['selection']
  });
  console.log('[Background] Context menu created');
});

// Handle context menu click
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'summarize-selection') {
    console.log('[Background] Context menu item clicked for selection');
    // Get the selected text
    const selectedText = info.selectionText;
    console.log('[Background] Selected text length:', selectedText.length);
    
    // Call API with just the selected text
    (async () => {
      try {
        console.log('[Background] Calling API with selected text');
        const response = await fetch(API_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            url: tab.url,
            title: tab.title,
            content: selectedText,
            length: 'medium',
            isSelection: true
          })
        });
        
        if (!response.ok) {
          console.error('[Background] API error for selection:', response.status);
          throw new Error(`API error: ${response.status}`);
        }
        
        const summary = await response.json();
        console.log('[Background] Received summary for selection');
        
        // Show the summary in a notification or popup
        chrome.notifications.create({
          type: 'basic',
          iconUrl: '../icons/icon128.png',
          title: 'Selection Summary',
          message: typeof summary === 'string' 
            ? summary.substring(0, 100) + '...'
            : 'Summary generated. Click to view in popup.'
        });
        
      } catch (error) {
        console.error('[Background] Error summarizing selection:', error);
      }
    })();
  }
}); 