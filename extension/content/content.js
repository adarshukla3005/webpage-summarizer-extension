// This script will be injected into every page
// It's responsible for:
// 1. Displaying summaries in the page
// 2. Communicating with the background script
// 3. Adding highlighting functionality

console.log('[Content] Content script loaded on:', window.location.href);

// Create and inject the summary overlay
function createSummaryOverlay() {
  console.log('[Content] Creating summary overlay');
  // Check if overlay already exists
  if (document.getElementById('universal-summarizer-overlay')) {
    console.log('[Content] Overlay already exists, reusing it');
    return document.getElementById('universal-summarizer-overlay');
  }
  
  console.log('[Content] Building new overlay UI');
  // Create overlay container
  const overlay = document.createElement('div');
  overlay.id = 'universal-summarizer-overlay';
  overlay.className = 'universal-summarizer hidden';
  
  // Create header with controls
  const header = document.createElement('div');
  header.className = 'summarizer-header';
  
  const title = document.createElement('h3');
  title.textContent = 'Page Summary';
  
  const closeBtn = document.createElement('button');
  closeBtn.className = 'summarizer-close-btn';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => {
    console.log('[Content] Close button clicked, hiding overlay');
    overlay.classList.add('hidden');
  });
  
  header.appendChild(title);
  header.appendChild(closeBtn);
  
  // Create content area
  const content = document.createElement('div');
  content.className = 'summarizer-content';
  
  // Create loading indicator
  const loader = document.createElement('div');
  loader.className = 'summarizer-loader';
  loader.innerHTML = '<div class="summarizer-spinner"></div><p>Generating summary...</p>';
  
  // Create summary container
  const summaryContainer = document.createElement('div');
  summaryContainer.className = 'summarizer-summary hidden';
  
  // Create error container
  const errorContainer = document.createElement('div');
  errorContainer.className = 'summarizer-error hidden';
  errorContainer.innerHTML = '<p>Failed to generate summary. Please try again.</p>';
  
  // Add everything to the overlay
  content.appendChild(loader);
  content.appendChild(summaryContainer);
  content.appendChild(errorContainer);
  
  overlay.appendChild(header);
  overlay.appendChild(content);
  
  // Append to body
  document.body.appendChild(overlay);
  console.log('[Content] Overlay added to the page');
  
  return overlay;
}

// Show the summary overlay
function showSummaryOverlay(summary) {
  console.log('[Content] Showing summary overlay');
  const overlay = createSummaryOverlay();
  const loader = overlay.querySelector('.summarizer-loader');
  const summaryContainer = overlay.querySelector('.summarizer-summary');
  const errorContainer = overlay.querySelector('.summarizer-error');
  
  // Hide loader and error
  loader.classList.add('hidden');
  errorContainer.classList.add('hidden');
  
  // Format and display summary
  console.log('[Content] Formatting summary for display');
  if (typeof summary === 'string') {
    console.log('[Content] Summary is a string');
    summaryContainer.innerHTML = summary.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
  } else {
    console.log('[Content] Summary is an object with structure');
    let html = '';
    
    if (summary.title) {
      html += `<h4>${summary.title}</h4>`;
    }
    
    if (summary.main) {
      html += `<p>${summary.main}</p>`;
    }
    
    if (summary.keyPoints && summary.keyPoints.length) {
      console.log('[Content] Processing', summary.keyPoints.length, 'key points');
      html += '<h5>Key Points</h5><ul>';
      summary.keyPoints.forEach(point => {
        html += `<li>${point}</li>`;
      });
      html += '</ul>';
    }
    
    summaryContainer.innerHTML = html;
  }
  
  // Show summary and overlay
  console.log('[Content] Revealing summary overlay');
  summaryContainer.classList.remove('hidden');
  overlay.classList.remove('hidden');
}

// Show loading state
function showLoadingOverlay() {
  console.log('[Content] Showing loading overlay');
  const overlay = createSummaryOverlay();
  const loader = overlay.querySelector('.summarizer-loader');
  const summaryContainer = overlay.querySelector('.summarizer-summary');
  const errorContainer = overlay.querySelector('.summarizer-error');
  
  // Show loader, hide others
  loader.classList.remove('hidden');
  summaryContainer.classList.add('hidden');
  errorContainer.classList.add('hidden');
  
  // Show overlay
  overlay.classList.remove('hidden');
}

// Show error state
function showErrorOverlay() {
  console.log('[Content] Showing error overlay');
  const overlay = createSummaryOverlay();
  const loader = overlay.querySelector('.summarizer-loader');
  const summaryContainer = overlay.querySelector('.summarizer-summary');
  const errorContainer = overlay.querySelector('.summarizer-error');
  
  // Show error, hide others
  loader.classList.add('hidden');
  summaryContainer.classList.add('hidden');
  errorContainer.classList.remove('hidden');
  
  // Show overlay
  overlay.classList.remove('hidden');
}

// Highlight key elements in the page based on the summary
function highlightKeyElements(keyPoints) {
  console.log('[Content] Highlighting key elements');
  // Remove existing highlights
  const existingHighlights = document.querySelectorAll('.summarizer-highlight');
  if (existingHighlights.length > 0) {
    console.log('[Content] Removing', existingHighlights.length, 'existing highlights');
    existingHighlights.forEach(el => {
      const parent = el.parentNode;
      parent.replaceChild(document.createTextNode(el.textContent), el);
      parent.normalize();
    });
  }
  
  if (!keyPoints || !keyPoints.length) {
    console.log('[Content] No key points to highlight');
    return;
  }
  
  // Create search terms from key points
  console.log('[Content] Creating search terms from key points');
  const searchTerms = keyPoints.flatMap(point => {
    // Extract meaningful phrases/terms (3+ words)
    const phrases = point.match(/\b(\w+\s+\w+\s+\w+\b(\s+\w+\b)*)/g) || [];
    return phrases;
  });
  
  if (!searchTerms.length) {
    console.log('[Content] No search terms extracted from key points');
    return;
  }
  
  console.log('[Content] Will search for', searchTerms.length, 'terms');
  
  // Get all text nodes in the document
  console.log('[Content] Collecting text nodes from document');
  const textNodes = [];
  const walk = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function(node) {
        // Skip nodes in our overlay and nodes with just whitespace
        if (
          node.parentElement.closest('#universal-summarizer-overlay') ||
          !node.textContent.trim()
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    },
    false
  );
  
  while (walk.nextNode()) {
    textNodes.push(walk.currentNode);
  }
  
  console.log('[Content] Found', textNodes.length, 'text nodes');
  
  // Highlight matching terms
  let highlightCount = 0;
  for (const node of textNodes) {
    for (const term of searchTerms) {
      const regex = new RegExp(`(${term})`, 'gi');
      if (regex.test(node.textContent)) {
        console.log('[Content] Found match for term:', term);
        const frag = document.createDocumentFragment();
        let lastIdx = 0;
        let match;
        
        // Reset regex
        regex.lastIndex = 0;
        
        // Create highlighted version
        while ((match = regex.exec(node.textContent)) !== null) {
          highlightCount++;
          // Add text before match
          if (match.index > lastIdx) {
            frag.appendChild(document.createTextNode(
              node.textContent.substring(lastIdx, match.index)
            ));
          }
          
          // Add highlighted match
          const highlight = document.createElement('span');
          highlight.className = 'summarizer-highlight';
          highlight.textContent = match[0];
          frag.appendChild(highlight);
          
          lastIdx = match.index + match[0].length;
        }
        
        // Add remaining text
        if (lastIdx < node.textContent.length) {
          frag.appendChild(document.createTextNode(
            node.textContent.substring(lastIdx)
          ));
        }
        
        // Replace node with fragment
        node.parentNode.replaceChild(frag, node);
        break; // Move to next node after finding a match
      }
    }
  }
  
  console.log('[Content] Added', highlightCount, 'highlights to the page');
}

// Listen for messages from the background script
console.log('[Content] Setting up message listener');
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Content] Message received:', request.action);
  
  if (request.action === 'showSummary') {
    console.log('[Content] Show summary request received');
    showSummaryOverlay(request.summary);
    
    // Highlight key elements if available
    if (request.summary && request.summary.keyPoints) {
      console.log('[Content] Summary contains key points, highlighting elements');
      highlightKeyElements(request.summary.keyPoints);
    }
    
    sendResponse({ success: true });
    return true;
  }
  
  if (request.action === 'showLoading') {
    console.log('[Content] Show loading request received');
    showLoadingOverlay();
    sendResponse({ success: true });
    return true;
  }
  
  if (request.action === 'showError') {
    showErrorOverlay();
    sendResponse({ success: true });
    return true;
  }
});

// Initialize the overlay but keep it hidden
createSummaryOverlay(); 