document.addEventListener('DOMContentLoaded', () => {
  console.log('[Popup] DOM content loaded, initializing popup');
  // Get DOM elements
  const summarizeBtn = document.getElementById('summarize-btn');
  const loadingEl = document.getElementById('loading');
  const summaryContainer = document.getElementById('summary-container');
  const summaryContent = document.getElementById('summary-content');
  const errorContainer = document.getElementById('error-container');
  const retryBtn = document.getElementById('retry-btn');
  const copyBtn = document.getElementById('copy-btn');
  const shareBtn = document.getElementById('share-btn');
  const ratingBtns = document.querySelectorAll('.rating-btn');
  const settingsBtn = document.getElementById('settings-btn');
  const privacyLink = document.getElementById('privacy-link');
  
  // Page info elements
  const pageTitle = document.getElementById('page-title');
  const pageUrl = document.getElementById('page-url');
  
  console.log('[Popup] DOM elements loaded');
  
  // Get current active tab
  const getCurrentTab = async () => {
    console.log('[Popup] Getting current active tab');
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log('[Popup] Active tab:', tabs[0].url);
    return tabs[0];
  };
  
  // Display the page info immediately
  const displayPageInfo = async () => {
    try {
      const tab = await getCurrentTab();
      console.log('[Popup] Displaying page info for:', tab.url);
      
      // Set the page title and URL
      pageTitle.textContent = tab.title || 'Unknown Page';
      pageUrl.textContent = tab.url;
      
      console.log('[Popup] Page info displayed successfully');
    } catch (error) {
      console.error('[Popup] Error displaying page info:', error);
      pageTitle.textContent = 'Could not load page details';
    }
  };
  
  // Show/hide elements
  const showLoading = () => {
    console.log('[Popup] Showing loading state');
    loadingEl.classList.remove('hidden');
    summaryContainer.classList.add('hidden');
    errorContainer.classList.add('hidden');
  };
  
  const showSummary = () => {
    console.log('[Popup] Showing summary');
    loadingEl.classList.add('hidden');
    summaryContainer.classList.remove('hidden');
    errorContainer.classList.add('hidden');
  };
  
  const showError = () => {
    console.log('[Popup] Showing error state');
    loadingEl.classList.add('hidden');
    summaryContainer.classList.add('hidden');
    errorContainer.classList.remove('hidden');
  };
  
  // Get summary length from radio buttons
  const getSummaryLength = () => {
    console.log('[Popup] Getting summary length from options');
    const lengthRadios = document.querySelectorAll('input[name="length"]');
    for (const radio of lengthRadios) {
      if (radio.checked) {
        console.log('[Popup] Selected length:', radio.value);
        return radio.value;
      }
    }
    console.log('[Popup] Using default length: medium');
    return 'medium'; // Default
  };
  
  // Generate summary
  const generateSummary = async () => {
    console.log('[Popup] Starting summary generation');
    
    // First show the loading state immediately
    showLoading();
    
    try {
      const tab = await getCurrentTab();
      const length = getSummaryLength();
      
      console.log('[Popup] Summarizing URL:', tab.url);
      console.log('[Popup] Summary length:', length);
      
      // Send message to background script to get summary
      console.log('[Popup] Sending message to background script');
      chrome.runtime.sendMessage(
        { 
          action: 'summarize', 
          url: tab.url,
          title: tab.title,
          length: length,
          save_history: true
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error('[Popup] Chrome runtime error:', chrome.runtime.lastError);
            showError();
            return;
          }
          
          console.log('[Popup] Received response from background:', response);
          
          if (response && response.success) {
            console.log('[Popup] Summary generation successful');
            console.log('[Popup] From cache:', response.fromCache || false);
            summaryContent.innerHTML = formatSummary(response.summary);
            showSummary();
            
            // Wait a short time to ensure the API has time to save the summary
            // to the history before we try to load it
            setTimeout(() => {
              console.log('[Popup] Reloading history after summary generation');
              loadHistoryWithRetry();
            }, 2000); // Increased timeout to 2 seconds
          } else {
            console.error('[Popup] Summary generation failed:', response ? response.error : 'Unknown error');
            showError();
          }
        }
      );
    } catch (error) {
      console.error('[Popup] Error generating summary:', error);
      showError();
    }
  };
  
  // Format summary with proper HTML
  const formatSummary = (summary) => {
    console.log('[Popup] Formatting summary');
    if (!summary) {
      console.error('[Popup] Summary is empty or undefined');
      return 'No summary data available.';
    }
    
    if (typeof summary === 'string') {
      console.log('[Popup] Summary is a string');
      return summary.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
    }
    
    console.log('[Popup] Summary is an object');
    let html = '';
    
    if (summary.title) {
      html += `<h3>${summary.title}</h3>`;
    }
    
    if (summary.main) {
      html += `<p>${summary.main}</p>`;
    }
    
    if (summary.keyPoints && summary.keyPoints.length) {
      console.log('[Popup] Summary has key points:', summary.keyPoints.length);
      html += '<h4>Key Points</h4><ul>';
      summary.keyPoints.forEach(point => {
        html += `<li>${point}</li>`;
      });
      html += '</ul>';
    }
    
    return html || 'No summary content available.';
  };
  
  // Copy summary to clipboard
  const copySummary = () => {
    console.log('[Popup] Copying summary to clipboard');
    const textToCopy = summaryContent.innerText;
    navigator.clipboard.writeText(textToCopy)
      .then(() => {
        console.log('[Popup] Summary copied to clipboard');
        // Show temporary "Copied!" notification
        copyBtn.innerHTML = '<span class="icon">✓</span>';
        setTimeout(() => {
          copyBtn.innerHTML = '<span class="icon">📋</span>';
        }, 1500);
      })
      .catch(err => {
        console.error('[Popup] Failed to copy text:', err);
      });
  };
  
  // Submit user feedback
  const submitFeedback = (rating) => {
    console.log('[Popup] Submitting feedback, rating:', rating);
    getCurrentTab().then(tab => {
      chrome.runtime.sendMessage(
        { 
          action: 'feedback', 
          rating: rating,
          url: tab.url
        },
        (response) => {
          console.log('[Popup] Feedback response:', response);
          // Highlight the selected button
          ratingBtns.forEach(btn => {
            btn.style.opacity = btn.dataset.rating === String(rating) ? '1' : '0.5';
          });
          
          // Restore original state after a delay
          setTimeout(() => {
            ratingBtns.forEach(btn => {
              btn.style.opacity = '1';
            });
          }, 2000);
        }
      );
    });
  };
  
  // Share summary (simplified implementation)
  const shareSummary = async () => {
    console.log('[Popup] Sharing summary');
    const tab = await getCurrentTab();
    const textToShare = `Summary of ${tab.title}\n\n${summaryContent.innerText}`;
    
    // Use Web Share API if available
    if (navigator.share) {
      console.log('[Popup] Using Web Share API');
      try {
        await navigator.share({
          title: `Summary of ${tab.title}`,
          text: textToShare,
          url: tab.url
        });
        console.log('[Popup] Shared successfully via Web Share API');
      } catch (err) {
        console.error('[Popup] Error sharing via Web Share API:', err);
        // Fallback to clipboard
        copySummary();
      }
    } else {
      console.log('[Popup] Web Share API not available, using clipboard fallback');
      // Fallback to clipboard
      copySummary();
      alert('Link copied to clipboard! You can now share it manually.');
    }
  };
  
  // Event listeners
  console.log('[Popup] Setting up event listeners');
  summarizeBtn.addEventListener('click', generateSummary);
  retryBtn.addEventListener('click', generateSummary);
  copyBtn.addEventListener('click', copySummary);
  shareBtn.addEventListener('click', shareSummary);
  
  ratingBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      submitFeedback(parseInt(btn.dataset.rating));
    });
  });
  
  settingsBtn.addEventListener('click', () => {
    console.log('[Popup] Opening options page');
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    }
  });
  
  privacyLink.addEventListener('click', (e) => {
    console.log('[Popup] Opening privacy page');
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('privacy.html') });
  });
  
  // Initialize popup - display page info and load history immediately
  console.log('[Popup] Initializing popup and displaying page info');
  displayPageInfo();

  // Load history with auto-retry
  console.log('[Popup] Loading history with auto-retry');
  loadHistoryWithRetry();

  // Check for cached summary, but don't show it automatically
  console.log('[Popup] Checking for cached summary');
  chrome.runtime.sendMessage(
    { action: 'getCachedSummary' },
    (response) => {
      console.log('[Popup] Cached summary response:', response);
      // We won't automatically show the summary anymore
      // User needs to click the Summarize button first
    }
  );

  // History Management
  async function loadHistory() {
    try {
      console.log('[Popup] Loading history from API');
      
      // Show loading indicator in history section
      const historyList = document.getElementById('history-list');
      historyList.innerHTML = '<p class="loading-text">Loading summaries...</p>';
      
      // Force cache to be bypassed with timestamp in URL
      const timestamp = new Date().getTime();
      const response = await fetch(`http://localhost:8000/api/history?t=${timestamp}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const responseText = await response.text();
      console.log('[Popup] Raw history response:', responseText.substring(0, 100) + '...');
      
      let summaries;
      try {
        summaries = JSON.parse(responseText);
      } catch (e) {
        console.error('[Popup] Error parsing history JSON:', e);
        throw new Error('Invalid JSON response from history API');
      }
      
      console.log('[Popup] Loaded summaries:', summaries);
      
      if (summaries && Array.isArray(summaries)) {
        console.log(`[Popup] Found ${summaries.length} summaries in history`);
        displayHistory(summaries);
        
        // Update the section header to show count
        const historyHeader = document.querySelector('.section-header h2');
        if (historyHeader) {
          historyHeader.textContent = summaries.length > 0 
            ? `Recent Summaries (${summaries.length})` 
            : 'Recent Summaries';
        }
      } else {
        console.error('[Popup] Invalid response format:', summaries);
        historyList.innerHTML = '<p class="error-message">Invalid response from server</p>';
      }
      
      return true; // Success
    } catch (error) {
      console.error('[Popup] Error loading history:', error);
      const historyList = document.getElementById('history-list');
      historyList.innerHTML = '<p class="error-message">Failed to load history</p>';
      
      // Add a retry button
      const retryButton = document.createElement('button');
      retryButton.textContent = 'Retry';
      retryButton.className = 'secondary-btn';
      retryButton.style.margin = '10px auto';
      retryButton.style.display = 'block';
      retryButton.addEventListener('click', loadHistory);
      historyList.appendChild(retryButton);
      
      throw error; // Re-throw for the retry function
    }
  }

  function displayHistory(summaries) {
    const historyList = document.getElementById('history-list');
    historyList.innerHTML = '';

    if (!summaries || summaries.length === 0) {
      historyList.innerHTML = '<p class="empty-state">No summaries yet</p>';
      return;
    }

    // Sort summaries by date, newest first
    summaries.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    summaries.forEach(summary => {
      const item = document.createElement('div');
      item.className = 'history-item';
      
      // Format the date
      const date = new Date(summary.created_at);
      const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
      
      // Create a preview of the summary
      const summaryPreview = summary.summary.main.substring(0, 100) + '...';
      
      item.innerHTML = `
        <div class="history-item-header">
          <div class="title">${summary.title || 'Untitled'}</div>
          <div class="meta">
            <span class="length-badge">${summary.length}</span>
            <span class="date">${formattedDate}</span>
          </div>
        </div>
        <div class="url">${summary.url}</div>
        <div class="summary-preview">${summaryPreview}</div>
        <div class="actions">
          <button class="view-btn" data-id="${summary.id}">View</button>
          <button class="delete-btn" data-id="${summary.id}">Delete</button>
        </div>
      `;
      historyList.appendChild(item);
    });

    // Add event listeners
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        viewSummary(id);
      });
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        deleteSummary(id);
      });
    });
  }

  async function viewSummary(id) {
    try {
      console.log('[Popup] Viewing summary:', id);
      const response = await fetch(`http://localhost:8000/api/history/${id}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const summary = await response.json();
      console.log('[Popup] Retrieved summary:', summary);
      
      // Display the summary
      summaryContent.innerHTML = formatSummary(summary.summary);
      showSummary();
    } catch (error) {
      console.error('[Popup] Error viewing summary:', error);
      showError();
    }
  }

  async function deleteSummary(id) {
    try {
      console.log('[Popup] Deleting summary:', id);
      const response = await fetch(`http://localhost:8000/api/history/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      console.log('[Popup] Summary deleted successfully');
      loadHistory(); // Reload the history
    } catch (error) {
      console.error('[Popup] Error deleting summary:', error);
      alert('Failed to delete summary. Please try again.');
    }
  }

  // Clear all history
  document.getElementById('clear-history').addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear all history?')) {
      try {
        console.log('[Popup] Clearing all history');
        const summaries = await fetch('http://localhost:8000/api/history').then(r => r.json());
        for (const summary of summaries) {
          await fetch(`http://localhost:8000/api/history/${summary.id}`, {
            method: 'DELETE'
          });
        }
        console.log('[Popup] All history cleared');
        loadHistory();
      } catch (error) {
        console.error('[Popup] Error clearing history:', error);
        alert('Failed to clear history. Please try again.');
      }
    }
  });

  // History Management with retry
  function loadHistoryWithRetry(retryCount = 0, maxRetries = 3) {
    loadHistory().catch(error => {
      console.error(`[Popup] History load attempt ${retryCount + 1} failed:`, error);
      if (retryCount < maxRetries) {
        const retryDelay = (retryCount + 1) * 1000;
        console.log(`[Popup] Retrying in ${retryDelay}ms...`);
        setTimeout(() => {
          loadHistoryWithRetry(retryCount + 1, maxRetries);
        }, retryDelay);
      } else {
        console.error('[Popup] All history load attempts failed');
      }
    });
  }

  // Update history every 30 seconds while popup is open
  setInterval(() => {
    console.log('[Popup] Auto-refreshing history');
    loadHistory().catch(error => {
      console.error('[Popup] Auto-refresh failed:', error);
    });
  }, 30000);
}); 