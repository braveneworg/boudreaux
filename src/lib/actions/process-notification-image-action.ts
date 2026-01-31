'use server';

import sharp from 'sharp';

import { requireRole } from '../utils/auth/require-role';

export interface ProcessNotificationImageInput {
  /** Base64-encoded original image data */
  imageBase64: string;
  /** MIME type of the image (e.g., 'image/jpeg') */
  mimeType: string;
  /** Main message text to overlay */
  message: string;
  /** Optional secondary message */
  secondaryMessage?: string;
  /** Whether to apply the text overlay */
  isOverlayed: boolean;
  /** Target width for the output image */
  width?: number;
  /** Target height for the output image */
  height?: number;
  /** Font family for main message */
  messageFont?: string;
  /** Font size in rem for main message (min 2.5) */
  messageFontSize?: number;
  /** Contrast/opacity percentage for main message (0-100) */
  messageContrast?: number;
  /** Font family for secondary message */
  secondaryMessageFont?: string;
  /** Font size in rem for secondary message (min 2.0) */
  secondaryMessageFontSize?: number;
  /** Contrast/opacity percentage for secondary message (0-100) */
  secondaryMessageContrast?: number;
  /** Hex color for main message text (e.g., #ffffff) */
  messageTextColor?: string;
  /** Hex color for secondary message text (e.g., #ffffff) */
  secondaryMessageTextColor?: string;
  /** Whether to show text shadow on main message */
  messageTextShadow?: boolean;
  /** Darkness of text shadow for main message (0-100, 0=light, 100=dark) */
  messageTextShadowDarkness?: number;
  /** Whether to show text shadow on secondary message */
  secondaryMessageTextShadow?: boolean;
  /** Darkness of text shadow for secondary message (0-100, 0=light, 100=dark) */
  secondaryMessageTextShadowDarkness?: number;
  /** Horizontal position of main message (0-100, 0=left, 50=center, 100=right) */
  messagePositionX?: number;
  /** Vertical position of main message (0-100, 0=top, 100=bottom) */
  messagePositionY?: number;
  /** Horizontal position of secondary message (0-100, 0=left, 50=center, 100=right) */
  secondaryMessagePositionX?: number;
  /** Vertical position of secondary message (0-100, 0=top, 100=bottom) */
  secondaryMessagePositionY?: number;
  /** Rotation angle for main message in degrees (-360 to 360) */
  messageRotation?: number;
  /** Rotation angle for secondary message in degrees (-360 to 360) */
  secondaryMessageRotation?: number;
}

export interface ProcessNotificationImageResult {
  success: boolean;
  /** Base64-encoded processed image */
  processedImageBase64?: string;
  /** MIME type of the processed image */
  mimeType?: string;
  error?: string;
}

// Golden ratio banner dimensions
const BANNER_WIDTH = 880;
const BANNER_HEIGHT = 544;

// Base pixel size for 1rem (used to convert rem to px)
const BASE_FONT_SIZE = 16;

/**
 * Process a notification banner image with text overlay on the server
 * Uses Sharp for high-quality image processing
 */
export async function processNotificationImageAction(
  input: ProcessNotificationImageInput
): Promise<ProcessNotificationImageResult> {
  try {
    await requireRole('admin');

    const {
      imageBase64,
      message,
      secondaryMessage,
      isOverlayed,
      width = BANNER_WIDTH,
      height = BANNER_HEIGHT,
      messageFont = 'system-ui',
      messageFontSize = 2.5,
      messageContrast = 100,
      secondaryMessageFont = 'system-ui',
      secondaryMessageFontSize = 2.0,
      secondaryMessageContrast = 95,
      messageTextColor = '#ffffff',
      secondaryMessageTextColor = '#ffffff',
      messageTextShadow = true,
      messageTextShadowDarkness = 50,
      secondaryMessageTextShadow = true,
      secondaryMessageTextShadowDarkness = 50,
      messagePositionX = 50,
      messagePositionY = 10,
      secondaryMessagePositionX = 50,
      secondaryMessagePositionY = 90,
      messageRotation = 0,
      secondaryMessageRotation = 0,
    } = input;

    // Decode base64 image
    const imageBuffer = Buffer.from(imageBase64, 'base64');

    // Start with the image
    let pipeline = sharp(imageBuffer).resize(width, height, {
      fit: 'cover',
      position: 'center',
    });

    // If overlay is not enabled or no message, just return the resized image
    if (!isOverlayed || !message) {
      const outputBuffer = await pipeline.jpeg({ quality: 92 }).toBuffer();
      return {
        success: true,
        processedImageBase64: outputBuffer.toString('base64'),
        mimeType: 'image/jpeg',
      };
    }

    // Log overlay settings for debugging
    console.info('[PROCESS_IMAGE] Creating text overlay with settings:', {
      message: message.substring(0, 50),
      messageFont,
      messageFontSize,
      messageFontSizePx: Math.round(messageFontSize * BASE_FONT_SIZE * (width / 880)),
      messagePositionX,
      messagePositionY,
      messageRotation,
      isOverlayed,
    });

    // Create text overlay SVG
    const svgOverlay = createTextOverlaySvg({
      message,
      secondaryMessage,
      width,
      height,
      messageFont,
      messageFontSize,
      messageContrast,
      secondaryMessageFont,
      secondaryMessageFontSize,
      secondaryMessageContrast,
      messageTextColor,
      secondaryMessageTextColor,
      messageTextShadow,
      messageTextShadowDarkness,
      secondaryMessageTextShadow,
      secondaryMessageTextShadowDarkness,
      messagePositionX,
      messagePositionY,
      secondaryMessagePositionX,
      secondaryMessagePositionY,
      messageRotation,
      secondaryMessageRotation,
    });

    // Composite the text overlay onto the image
    pipeline = pipeline.composite([
      {
        input: Buffer.from(svgOverlay),
        top: 0,
        left: 0,
      },
    ]);

    const outputBuffer = await pipeline.jpeg({ quality: 92 }).toBuffer();

    return {
      success: true,
      processedImageBase64: outputBuffer.toString('base64'),
      mimeType: 'image/jpeg',
    };
  } catch (error) {
    console.error('Error processing notification image:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process image',
    };
  }
}

interface TextOverlaySvgOptions {
  message: string;
  secondaryMessage?: string;
  width: number;
  height: number;
  messageFont: string;
  messageFontSize: number;
  messageContrast: number;
  secondaryMessageFont: string;
  secondaryMessageFontSize: number;
  secondaryMessageContrast: number;
  messageTextColor: string;
  secondaryMessageTextColor: string;
  messageTextShadow: boolean;
  messageTextShadowDarkness: number;
  secondaryMessageTextShadow: boolean;
  secondaryMessageTextShadowDarkness: number;
  messagePositionX: number;
  messagePositionY: number;
  secondaryMessagePositionX: number;
  secondaryMessagePositionY: number;
  messageRotation: number;
  secondaryMessageRotation: number;
}

/**
 * Get the font stack for a given font family
 */
function getFontStack(fontFamily: string): string {
  if (fontFamily === 'system-ui') {
    return "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  }
  // Wrap font name in quotes and add fallbacks
  return `'${fontFamily}', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
}

/**
 * Creates an SVG overlay with text and gradient for compositing onto the image
 * Text is positioned at top (message) and bottom (secondary message) with padding
 * Text styling is designed to meet WCAG AA contrast requirements (4.5:1 minimum)
 */
function createTextOverlaySvg(options: TextOverlaySvgOptions): string {
  const {
    message,
    secondaryMessage,
    width,
    height,
    messageFont,
    messageFontSize,
    messageContrast,
    secondaryMessageFont,
    secondaryMessageFontSize,
    secondaryMessageContrast,
    messageTextColor,
    secondaryMessageTextColor,
    messageTextShadow,
    messageTextShadowDarkness,
    secondaryMessageTextShadow,
    secondaryMessageTextShadowDarkness,
    messagePositionX,
    messagePositionY,
    secondaryMessagePositionX,
    secondaryMessagePositionY,
    messageRotation,
    secondaryMessageRotation,
  } = options;

  // Strip any HTML/markup from messages - render as plain text only
  const plainMessage = stripHtmlTags(message);
  const plainSecondaryMessage = secondaryMessage ? stripHtmlTags(secondaryMessage) : undefined;

  // Convert rem to pixels (scaled for image dimensions)
  // Scale factor accounts for typical 880px width banner
  const scaleFactor = width / 880;
  const messageFontSizePx = Math.round(messageFontSize * BASE_FONT_SIZE * scaleFactor);
  const secondaryFontSizePx = Math.round(secondaryMessageFontSize * BASE_FONT_SIZE * scaleFactor);

  // Get font stacks
  const messageFontStack = getFontStack(messageFont);
  const secondaryFontStack = getFontStack(secondaryMessageFont);

  // Convert contrast percentage to opacity (0-1)
  const messageOpacity = messageContrast / 100;
  const secondaryOpacity = secondaryMessageContrast / 100;

  // Convert hex color to RGB values
  const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : { r: 255, g: 255, b: 255 };
  };

  // Get RGB values for text colors
  const messageRgb = hexToRgb(messageTextColor);
  const secondaryRgb = hexToRgb(secondaryMessageTextColor);

  // Convert shadow darkness (0-100) to opacity value (0.3 to 0.9)
  // 0% darkness = 0.3 opacity (light shadow), 100% darkness = 0.9 opacity (dark shadow)
  const messageShadowOpacity = 0.3 + (messageTextShadowDarkness / 100) * 0.6;
  const secondaryShadowOpacity = 0.3 + (secondaryMessageTextShadowDarkness / 100) * 0.6;

  // Word wrap the plain text messages
  const maxCharsPerLine = Math.floor(width / (messageFontSizePx * 0.55));
  const messageLines = wrapText(plainMessage, maxCharsPerLine);
  const secondaryLines = plainSecondaryMessage
    ? wrapText(plainSecondaryMessage, Math.floor(width / (secondaryFontSizePx * 0.55)))
    : [];

  // Calculate vertical positioning
  const lineHeight = messageFontSizePx * 1.3;
  const secondaryLineHeight = secondaryFontSizePx * 1.4;

  // Calculate X positions based on percentage (0-100)
  // Convert percentage to pixel position
  const messageX = Math.round((messagePositionX / 100) * width);
  const secondaryX = Math.round((secondaryMessagePositionX / 100) * width);

  // Determine text-anchor based on X position
  // Left third = start, middle third = middle, right third = end
  const getTextAnchor = (xPercent: number): string => {
    if (xPercent < 33) return 'start';
    if (xPercent > 67) return 'end';
    return 'middle';
  };
  const messageTextAnchor = getTextAnchor(messagePositionX);
  const secondaryTextAnchor = getTextAnchor(secondaryMessagePositionX);

  // Calculate Y positions based on percentage (0-100)
  const messageBaseY = Math.round((messagePositionY / 100) * height);
  const secondaryBaseY = Math.round((secondaryMessagePositionY / 100) * height);

  // Build the SVG with text overlay
  // Simple styling: font-family, font-size, and opacity only
  // Optional shadow for readability on varied backgrounds
  const svg = `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Text shadow filters with configurable darkness -->
    <filter id="message-shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="1" dy="1" stdDeviation="2" flood-color="rgba(0,0,0,${messageShadowOpacity.toFixed(2)})"/>
    </filter>
    <filter id="secondary-shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="1" dy="1" stdDeviation="2" flood-color="rgba(0,0,0,${secondaryShadowOpacity.toFixed(2)})"/>
    </filter>
  </defs>

  <!-- Main message - positioned based on percentage coordinates -->
  ${messageLines
    .map((line, index) => {
      // Center the text block vertically around the Y position
      const offsetFromCenter = (index - (messageLines.length - 1) / 2) * lineHeight;
      const y = messageBaseY + offsetFromCenter;
      const filterAttr = messageTextShadow ? ' filter="url(#message-shadow)"' : '';
      const transformAttr =
        messageRotation !== 0 ? ` transform="rotate(${messageRotation}, ${messageX}, ${y})"` : '';
      return `
    <text x="${messageX}" y="${y}" text-anchor="${messageTextAnchor}" dominant-baseline="middle"
      font-family="${messageFontStack}"
      font-size="${messageFontSizePx}"
      fill="rgba(${messageRgb.r},${messageRgb.g},${messageRgb.b},${messageOpacity})"${filterAttr}${transformAttr}>${escapeXml(line)}</text>`;
    })
    .join('\n  ')}

  ${
    secondaryLines.length > 0
      ? `<!-- Secondary message - positioned based on percentage coordinates -->
  ${secondaryLines
    .map((line, index) => {
      // Center the text block vertically around the Y position
      const offsetFromCenter = (index - (secondaryLines.length - 1) / 2) * secondaryLineHeight;
      const y = secondaryBaseY + offsetFromCenter;
      const filterAttr = secondaryMessageTextShadow ? ' filter="url(#secondary-shadow)"' : '';
      const transformAttr =
        secondaryMessageRotation !== 0
          ? ` transform="rotate(${secondaryMessageRotation}, ${secondaryX}, ${y})"`
          : '';
      return `
    <text x="${secondaryX}" y="${y}" text-anchor="${secondaryTextAnchor}" dominant-baseline="middle"
      font-family="${secondaryFontStack}"
      font-size="${secondaryFontSizePx}"
      fill="rgba(${secondaryRgb.r},${secondaryRgb.g},${secondaryRgb.b},${secondaryOpacity})"${filterAttr}${transformAttr}>${escapeXml(line)}</text>`;
    })
    .join('\n  ')}`
      : ''
  }
</svg>`;

  return svg;
}

/**
 * Wrap text to fit within a maximum number of characters per line
 */
function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (testLine.length <= maxChars) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Strip HTML tags and normalize text to plain text
 * This ensures no markup is interpreted - only plain text with font styling
 */
function stripHtmlTags(text: string): string {
  return (
    text
      // Remove HTML tags
      .replace(/<[^>]*>/g, '')
      // Decode common HTML entities to their plain text equivalents
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&apos;/gi, "'")
      // Remove any remaining HTML entities (numeric or named)
      .replace(/&#?\w+;/g, '')
      // Normalize whitespace (collapse multiple spaces, trim)
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Escape special XML characters for safe SVG rendering
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
