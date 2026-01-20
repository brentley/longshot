/**
 * Offscreen Document Script
 * Handles stitching captured viewport images into full-page PNG
 */

const DEBUG = true;

function log(...args) {
  if (DEBUG) {
    const formatted = args.map(arg => {
      if (arg instanceof Error) {
        return `${arg.message}\n${arg.stack || ''}`;
      }
      if (typeof arg === 'object' && arg !== null) {
        try {
          return JSON.stringify(arg, null, 2);
        } catch (e) {
          return String(arg);
        }
      }
      return arg;
    });
    console.log('[Offscreen]', ...formatted);
  }
}

function error(...args) {
  const formatted = args.map(arg => {
    if (arg instanceof Error) {
      return `${arg.message}\n${arg.stack || ''}`;
    }
    if (typeof arg === 'object' && arg !== null) {
      try {
        return JSON.stringify(arg, null, 2);
      } catch (e) {
        return String(arg);
      }
    }
    return arg;
  });
  console.error('[Offscreen]', ...formatted);
}

/**
 * Sanitize canvas dimension to valid unsigned long
 * OffscreenCanvas requires positive integers in range [1, 32767]
 */
function sanitizeCanvasDimension(value, defaultValue = 800) {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  const numValue = Number(value);
  if (isNaN(numValue) || !isFinite(numValue)) {
    return defaultValue;
  }

  let intValue = Math.floor(numValue);

  if (intValue < 1) {
    intValue = defaultValue;
  }

  if (intValue > 32767) {
    intValue = 32767;
  }

  return intValue;
}

/**
 * Load image from data URL
 */
function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}

/**
 * Stitch captured viewport images together
 */
async function stitchCapturedViewports(captures, overlapHeight) {
  try {
    log(`Stitching ${captures.length} viewport captures with ${overlapHeight}px overlap`);

    if (captures.length === 0) {
      throw new Error('No captures to stitch');
    }

    // Load all images
    log('Loading all captured images...');
    const images = [];
    for (let i = 0; i < captures.length; i++) {
      log(`Loading capture ${i + 1}/${captures.length}...`);
      const img = await loadImageFromDataUrl(captures[i].dataUrl);
      images.push({
        img,
        viewportHeight: captures[i].viewportHeight,
        viewportWidth: captures[i].viewportWidth,
        scrollY: captures[i].scrollY,
        isLastCapture: captures[i].isLastCapture
      });
    }

    // Calculate canvas dimensions
    const canvasWidth = images[0].img.width;
    let totalHeight = images[0].img.height; // First capture is full height

    // Each subsequent capture overlaps by overlapHeight
    for (let i = 1; i < images.length; i++) {
      const newHeight = images[i].img.height - overlapHeight;
      totalHeight += newHeight;
    }

    log(`Canvas dimensions: ${canvasWidth}x${totalHeight}`);

    // Validate dimensions
    const sanitizedWidth = sanitizeCanvasDimension(canvasWidth, 800);
    const sanitizedHeight = sanitizeCanvasDimension(totalHeight, 600);

    // Create output canvas
    log('Creating output canvas...');
    const outputCanvas = new OffscreenCanvas(sanitizedWidth, sanitizedHeight);
    const ctx = outputCanvas.getContext('2d');

    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    // Draw images with overlap handling
    let currentY = 0;

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      const drawHeight = i === 0 ? image.img.height : image.img.height - overlapHeight;
      const sourceY = i === 0 ? 0 : overlapHeight;

      log(`Drawing image ${i + 1} at Y=${currentY}, source Y=${sourceY}, height=${drawHeight}`);

      // Use canvas API to composite images with overlap blending
      if (i > 0) {
        // For overlapping region, draw with some opacity for smooth blending
        ctx.globalAlpha = 0.5;
        ctx.drawImage(
          image.img,
          0, sourceY, canvasWidth, overlapHeight,
          0, currentY, canvasWidth, overlapHeight
        );
        ctx.globalAlpha = 1.0;
      }

      // Draw the main part of the image
      ctx.drawImage(
        image.img,
        0, sourceY, canvasWidth, drawHeight - (i > 0 ? overlapHeight : 0),
        0, currentY + (i > 0 ? overlapHeight : 0), canvasWidth, drawHeight - (i > 0 ? overlapHeight : 0)
      );

      currentY += drawHeight;
    }

    log('Stitching complete, converting to PNG...');

    // Convert to blob
    const blob = await outputCanvas.convertToBlob({ type: 'image/png' });
    log(`Stitched PNG created: ${blob.size} bytes`);

    return blob;

  } catch (e) {
    error('Failed to stitch captures:', e);
    throw new Error(`Failed to stitch captures: ${e.message}`);
  }
}

/**
 * Handle message from background
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  log(`Received message type: ${message?.type || 'undefined'}`);

  if (message.type === 'STITCH_CAPTURES') {
    log('Processing STITCH_CAPTURES request');

    stitchCapturedViewports(message.captures, message.overlapHeight)
      .then((blob) => {
        const pngBlobUrl = URL.createObjectURL(blob);
        log('Sending stitched PNG blob URL');
        sendResponse({
          success: true,
          pngBlobUrl: pngBlobUrl
        });
      })
      .catch((e) => {
        error('Stitching failed:', e);
        sendResponse({
          error: e.message || 'Failed to stitch captures'
        });
      });

    return true; // Will respond asynchronously
  }

  log(`Ignoring message type: ${message.type}`);
  return false;
});

console.log('[Offscreen] Document loaded and ready');
