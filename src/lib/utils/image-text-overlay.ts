/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/**
 * Utility to burn text overlays onto images using Canvas API
 */

export interface TextOverlayOptions {
  message: string;
  secondaryMessage?: string;
  imageBlob: Blob;
  width: number;
  height: number;
}

export interface TextOverlayResult {
  blob: Blob;
  dataUrl: string;
}

/**
 * Burns text overlay onto an image
 * - Message is centered with strong text shadow for contrast
 * - Secondary message is 90% opacity, smaller, with varied placement
 */
export async function addTextOverlayToImage(
  options: TextOverlayOptions
): Promise<TextOverlayResult> {
  const { message, secondaryMessage, imageBlob, width, height } = options;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    img.onload = () => {
      // Set canvas dimensions
      canvas.width = width;
      canvas.height = height;

      // Draw the image
      ctx.drawImage(img, 0, 0, width, height);

      // Add gradient overlay for better text contrast
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, 'rgba(0, 0, 0, 0.2)');
      gradient.addColorStop(0.4, 'rgba(0, 0, 0, 0.3)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0.6)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // Calculate font sizes based on image dimensions
      const messageFontSize = Math.max(24, Math.min(48, width / 18));
      const secondaryFontSize = Math.max(16, Math.min(32, width / 28));

      // Draw main message
      if (message) {
        ctx.font = `bold ${messageFontSize}px system-ui, -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Multiple shadow layers for strong contrast
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;

        ctx.fillStyle = '#ffffff';

        // Word wrap the message
        const maxWidth = width * 0.85;
        const lines = wrapText(ctx, message, maxWidth);
        const lineHeight = messageFontSize * 1.3;
        const totalTextHeight = lines.length * lineHeight;

        // Position message in center-ish area (slightly above center if secondary message exists)
        const messageY = secondaryMessage
          ? height * 0.45 - totalTextHeight / 2
          : height * 0.5 - totalTextHeight / 2;

        lines.forEach((line, index) => {
          const y = messageY + index * lineHeight + lineHeight / 2;
          // Draw text multiple times for stronger shadow effect
          ctx.fillText(line, width / 2, y);
        });

        // Draw secondary message if provided
        if (secondaryMessage) {
          ctx.font = `${secondaryFontSize}px system-ui, -apple-system, sans-serif`;

          // 90% opacity white
          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';

          // Slightly lighter shadow
          ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
          ctx.shadowBlur = 6;
          ctx.shadowOffsetX = 1;
          ctx.shadowOffsetY = 1;

          // Word wrap secondary message
          const secondaryMaxWidth = width * 0.75;
          const secondaryLines = wrapText(ctx, secondaryMessage, secondaryMaxWidth);
          const secondaryLineHeight = secondaryFontSize * 1.4;

          // Generate pseudo-random horizontal offset based on message content
          // This creates "varied" placement that's consistent for the same message
          const hashCode = secondaryMessage.split('').reduce((acc, char) => {
            return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
          }, 0);
          const randomOffset = ((hashCode % 100) - 50) * (width * 0.001); // Small random offset

          // Position below the main message with good spacing
          const secondaryY = messageY + totalTextHeight + height * 0.08;

          secondaryLines.forEach((line, index) => {
            const y = secondaryY + index * secondaryLineHeight;
            ctx.fillText(line, width / 2 + randomOffset, y);
          });
        }
      }

      // Convert canvas to blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve({
              blob,
              dataUrl: canvas.toDataURL('image/jpeg', 0.92),
            });
          } else {
            reject(new Error('Failed to create blob from canvas'));
          }
        },
        'image/jpeg',
        0.92
      );
    };

    img.onerror = () => {
      reject(new Error('Failed to load image for text overlay'));
    };

    // Load the image from blob
    img.src = URL.createObjectURL(imageBlob);
  });
}

/**
 * Wraps text to fit within a maximum width
 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}
