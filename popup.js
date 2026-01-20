/**
 * Popup Script
 * Handles UI interactions for Longshot
 */

const DEBUG = false;

function log(...args) {
  if (DEBUG) console.log('[Popup]', ...args);
}

// DOM elements
let captureBtn;
let regionCaptureBtn;
let toggleConfigBtn;
let configPanel;
let statusDiv;
let statusMessage;
let errorMessage;
let preCapture;
let restrictedPageMessage;

// Configuration
let currentConfig = {
  preCapture: false,
  preCaptureMaxDuration: 10000
};

/**
 * Check if a URL is capturable
 */
function isCapturableUrl(url) {
  if (!url) return false;
  const restrictedSchemes = [
    'chrome://', 'chrome-extension://', 'brave://',
    'edge://', 'opera://', 'about:', 'view-source:', 'file://'
  ];
  return !restrictedSchemes.some(scheme => url.startsWith(scheme));
}

/**
 * Initialize popup
 */
async function initializePopup() {
  log('Initializing popup');

  // Get DOM elements
  captureBtn = document.getElementById('captureBtn');
  regionCaptureBtn = document.getElementById('regionCaptureBtn');
  toggleConfigBtn = document.getElementById('toggleConfig');
  configPanel = document.getElementById('configPanel');
  statusDiv = document.getElementById('status');
  statusMessage = document.getElementById('statusMessage');
  errorMessage = document.getElementById('errorMessage');
  preCapture = document.getElementById('preCapture');
  restrictedPageMessage = document.getElementById('restrictedPageMessage');

  // Load config
  await loadConfig();

  // Check current tab
  await checkCurrentTabUrl();

  // Check for active capture
  await checkActiveCaptureState();

  // Event listeners
  captureBtn.addEventListener('click', handleCapture);
  regionCaptureBtn.addEventListener('click', handleRegionCapture);
  toggleConfigBtn.addEventListener('click', toggleConfigPanel);
  preCapture.addEventListener('change', saveConfig);

  // Listen for status updates
  chrome.runtime.onMessage.addListener(handleStatusMessage);

  log('Popup initialized');
}

/**
 * Check current tab URL
 */
async function checkCurrentTabUrl() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0 && !isCapturableUrl(tabs[0].url)) {
      captureBtn.disabled = true;
      restrictedPageMessage.classList.add('show');
    }
  } catch (e) {
    log('Error checking tab URL:', e);
  }
}

/**
 * Check for active capture state
 */
async function checkActiveCaptureState() {
  try {
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_CAPTURE_STATUS' }, resolve);
    });

    if (response && response.captureState) {
      const state = response.captureState;
      const age = Date.now() - (state.timestamp || 0);

      if (age < 60000 && state.status !== 'completed' && state.status !== 'error') {
        showCaptureStatus(state.status, state.message, state.progress);
        captureBtn.disabled = true;
      } else if (state.status === 'completed' && age < 5000) {
        showCaptureStatus(state.status, state.message, 100);
      }
    }
  } catch (e) {
    log('Error checking capture state:', e);
  }
}

/**
 * Load configuration
 */
async function loadConfig() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, (response) => {
      if (response && response.config) {
        currentConfig = response.config;
        preCapture.checked = currentConfig.preCapture === true;
      }
      resolve();
    });
  });
}

/**
 * Save configuration
 */
function saveConfig() {
  currentConfig = {
    preCapture: preCapture.checked,
    preCaptureMaxDuration: 10000
  };

  chrome.runtime.sendMessage({ type: 'SET_CONFIG', config: currentConfig });
}

/**
 * Toggle config panel
 */
function toggleConfigPanel() {
  configPanel.classList.toggle('show');
  toggleConfigBtn.textContent = configPanel.classList.contains('show')
    ? 'Options ▲'
    : 'Options ▼';
}

/**
 * Handle capture button click
 */
async function handleCapture() {
  log('Capture requested');

  errorMessage.classList.remove('show');
  errorMessage.textContent = '';
  captureBtn.disabled = true;
  statusDiv.classList.add('show');
  statusMessage.textContent = 'Starting capture...';
  statusDiv.className = 'status show info';

  try {
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'START_CAPTURE', config: currentConfig },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!response) {
            reject(new Error('No response from background'));
          } else {
            resolve(response);
          }
        }
      );
    });

    if (!response.success) {
      throw new Error(response.error || 'Capture failed');
    }

    log('Capture started:', response.sessionId);

  } catch (error) {
    log('Capture error:', error);
    statusDiv.className = 'status show error';
    statusMessage.textContent = 'Capture failed!';
    errorMessage.classList.add('show');
    errorMessage.textContent = error.message;
    captureBtn.disabled = false;
  }
}

/**
 * Handle region capture button click
 */
async function handleRegionCapture() {
  log('Region capture requested');

  errorMessage.classList.remove('show');
  errorMessage.textContent = '';

  try {
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'START_REGION_CAPTURE' },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!response) {
            reject(new Error('No response from background'));
          } else {
            resolve(response);
          }
        }
      );
    });

    if (!response.success) {
      throw new Error(response.error || 'Region capture failed');
    }

    log('Region capture started:', response.sessionId);

    // Close popup so user can select element on page
    window.close();

  } catch (error) {
    log('Region capture error:', error);
    statusDiv.className = 'status show error';
    statusMessage.textContent = 'Capture failed!';
    errorMessage.classList.add('show');
    errorMessage.textContent = error.message;
  }
}

/**
 * Show capture status
 */
function showCaptureStatus(status, message, progress) {
  statusDiv.classList.add('show');

  let statusText = message || '';
  if (!statusText) {
    const statusTextMap = {
      'started': 'Starting capture...',
      'preparing': 'Preparing page...',
      'stabilizing': 'Expanding content...',
      'capturing': 'Capturing viewports...',
      'stitching': 'Stitching images...',
      'downloading': 'Downloading...',
      'completed': 'Capture complete!',
      'error': 'Error occurred'
    };
    statusText = statusTextMap[status] || 'Processing...';
  }

  if (progress !== null && progress !== undefined && status === 'capturing') {
    statusText += ` (${progress}%)`;
  }

  statusMessage.textContent = statusText;

  if (status === 'completed') {
    statusDiv.className = 'status show success';
    captureBtn.disabled = false;
  } else if (status === 'error') {
    statusDiv.className = 'status show error';
    captureBtn.disabled = false;
  } else {
    statusDiv.className = 'status show info';
  }
}

/**
 * Handle status messages from background
 */
function handleStatusMessage(message) {
  if (message.type !== 'CAPTURE_STATUS') return;
  log('Status update:', message.status, message.message);
  showCaptureStatus(message.status, message.message, message.progress);
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initializePopup);
