/**
 * Content Script
 * Handles DOM stabilization and pre-capture interactions
 */

const DEBUG = false;

function log(...args) {
  if (DEBUG) console.log('[ContentScript]', ...args);
}

function error(...args) {
  console.error('[ContentScript]', ...args);
}

/**
 * Find and click "expand" or "show more" buttons
 */
async function expandElements() {
  const patterns = [
    'show more',
    'expand',
    'view more',
    'load more',
    'see more',
    'reveal',
    'unfold'
  ];

  const expandButtonRegex = new RegExp(patterns.join('|'), 'i');

  let clickedCount = 0;
  const maxClicks = 50; // Safety limit

  // Find all buttons and links that might expand content
  const elements = document.querySelectorAll('button, a, div[role="button"]');

  for (const element of elements) {
    if (clickedCount >= maxClicks) break;

    const text = element.textContent.toLowerCase().trim();

    // Check if element matches expand pattern
    if (expandButtonRegex.test(text)) {
      // Avoid dangerous actions
      if (/save|submit|delete|remove|cancel|close|exit/i.test(text)) {
        log('Skipping dangerous button:', text);
        continue;
      }

      try {
        log('Clicking expand button:', text);
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(r => setTimeout(r, 100)); // Wait for scroll
        element.click();
        clickedCount++;
        await new Promise(r => setTimeout(r, 500)); // Wait for content to load
      } catch (e) {
        log('Failed to click element:', e);
      }
    }
  }

  log(`Clicked ${clickedCount} expand buttons`);
  return clickedCount;
}

/**
 * Scroll page to load lazy content
 */
async function scrollToBottom(maxDuration = 10000) {
  log('Starting scroll to bottom');
  const startTime = Date.now();
  const originalHeight = document.documentElement.scrollHeight;
  let lastHeight = originalHeight;
  let stableCount = 0;
  const stabilityThreshold = 3; // Require 3 stable measurements

  while (Date.now() - startTime < maxDuration && stableCount < stabilityThreshold) {
    // Scroll to bottom
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise(r => setTimeout(r, 300));

    // Check if height changed
    const newHeight = document.documentElement.scrollHeight;
    if (newHeight === lastHeight) {
      stableCount++;
      log('Page height stable:', stableCount);
    } else {
      stableCount = 0;
      log('Page height changed:', lastHeight, '→', newHeight);
      lastHeight = newHeight;
    }

    // Yield to UI
    await new Promise(r => setTimeout(r, 100));
  }

  // Scroll back to top
  window.scrollTo(0, 0);
  log('Scroll complete, final height:', lastHeight);
}

/**
 * Check DOM stability
 */
async function checkDomStability(duration = 2000) {
  log('Checking DOM stability');
  const startTime = Date.now();
  const measurements = [];

  while (Date.now() - startTime < duration) {
    measurements.push(document.documentElement.scrollHeight);
    await new Promise(r => setTimeout(r, 100));
  }

  // Check if measurements are stable (within 10 pixels)
  const firstMeasurement = measurements[0];
  const isStable = measurements.every(m => Math.abs(m - firstMeasurement) < 10);

  log('DOM stability check:', isStable, 'Height:', firstMeasurement);
  return isStable;
}

/**
 * Perform pre-capture DOM stabilization
 */
async function performDomStabilization(maxDuration) {
  try {
    log('Starting DOM stabilization with max duration:', maxDuration);
    const startTime = Date.now();

    // Expand elements first
    await expandElements();

    // Scroll to load lazy content
    const remainingTime = maxDuration - (Date.now() - startTime);
    if (remainingTime > 1000) {
      await scrollToBottom(Math.min(remainingTime, 5000));
    }

    // Check stability
    await checkDomStability(1000);

    const elapsed = Date.now() - startTime;
    log(`DOM stabilization completed in ${elapsed}ms`);

  } catch (e) {
    error('DOM stabilization failed:', e);
  }
}

/**
 * Get page dimensions for scroll capture
 */
function getPageDimensions() {
  return {
    scrollHeight: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth,
    viewportHeight: window.innerHeight,
    viewportWidth: window.innerWidth,
    currentScrollY: window.scrollY,
    currentScrollX: window.scrollX,
    devicePixelRatio: window.devicePixelRatio || 1
  };
}

/**
 * Scroll to a specific position
 */
function scrollToPosition(x, y) {
  return new Promise((resolve) => {
    window.scrollTo(x, y);
    // Wait for scroll to settle (allows render and event processing)
    setTimeout(() => {
      resolve({
        scrolledToX: window.scrollX,
        scrolledToY: window.scrollY
      });
    }, 150);
  });
}

/**
 * Message listener
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Simple ping to check if content script is loaded
  if (message.type === 'PING') {
    sendResponse({ success: true, loaded: true });
    return true;
  }

  if (message.type === 'DOM_STABILIZE') {
    log('Received DOM_STABILIZE request');

    performDomStabilization(message.maxDuration || 10000)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((e) => {
        error('Stabilization error:', e);
        sendResponse({ success: false, error: e.message });
      });

    return true; // Will respond asynchronously
  }

  if (message.type === 'SCROLL_CAPTURE_INIT') {
    log('Received SCROLL_CAPTURE_INIT request');
    try {
      const dims = getPageDimensions();
      log('Page dimensions:', dims);
      sendResponse({ success: true, ...dims });
    } catch (e) {
      error('Failed to get page dimensions:', e);
      sendResponse({ success: false, error: e.message });
    }
    return true;
  }

  if (message.type === 'SCROLL_TO') {
    log(`Received SCROLL_TO request: x=${message.x}, y=${message.y}`);
    scrollToPosition(message.x || 0, message.y || 0)
      .then((result) => {
        log('Scroll completed:', result);
        sendResponse({ success: true, ...result });
      })
      .catch((e) => {
        error('Failed to scroll:', e);
        sendResponse({ success: false, error: e.message });
      });
    return true; // Will respond asynchronously
  }
});

log('Content script loaded');
