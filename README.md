# Longshot

A Chrome/Brave extension that captures full-page screenshots by scrolling and stitching viewport captures together.

## Features

- **Full-page capture** - Automatically scrolls through the entire page and stitches screenshots together
- **Keyboard shortcut** - `Cmd+Shift+S` (Mac) / `Ctrl+Shift+S` (Windows/Linux)
- **Smart filenames** - Saves as `PageTitle_hostname_timestamp.png`
- **Progress tracking** - Shows capture progress, persists even if you close the popup
- **Content expansion** - Optional pre-capture to expand "Show more" buttons and lazy content

## Installation

1. Clone or download this repository
2. Open `chrome://extensions` (or `brave://extensions`)
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked" and select this folder
5. The extension icon will appear in your toolbar

## Usage

### Via Popup
1. Navigate to any webpage
2. Click the extension icon
3. Click "Capture Full Page"
4. Wait for capture to complete (progress shown in popup)
5. PNG automatically downloads to your default folder

### Via Keyboard Shortcut
1. Navigate to any webpage
2. Press `Cmd+Shift+S` (Mac) or `Ctrl+Shift+S` (Windows/Linux)
3. Capture runs in background and downloads automatically

### Customizing the Shortcut
1. Go to `chrome://extensions/shortcuts` (or `brave://extensions/shortcuts`)
2. Find "Longshot"
3. Click the pencil icon to change the shortcut

## Options

Click "Options" in the popup to access:

- **Expand content before capture** - Clicks "Show more" buttons and scrolls to load lazy content before capturing

## How It Works

1. Gets page dimensions from content script
2. Scrolls through page viewport by viewport
3. Captures each viewport using `chrome.tabs.captureVisibleTab()`
4. Stitches captures together in an offscreen document using OffscreenCanvas
5. Downloads the final PNG

## Limitations

- Cannot capture browser internal pages (`chrome://`, `brave://`, `about:`, etc.)
- Very long pages may take time due to Chrome's capture rate limiting (~2 captures/second)
- Maximum canvas size is 32,767 pixels (browser limitation)

## Files

```
├── manifest.json      # Extension configuration
├── background.js      # Service worker - orchestrates capture
├── contentScript.js   # Injected into pages - handles scrolling
├── offscreen.html     # Offscreen document container
├── offscreen.js       # Image stitching logic
├── popup.html         # Extension popup UI
├── popup.js           # Popup interactions
└── icons/             # Extension icons
```

## Browser Support

- Chrome 116+
- Brave (latest)
- Edge (Chromium-based)
- Other Chromium browsers with Manifest V3 support

## License

MIT
