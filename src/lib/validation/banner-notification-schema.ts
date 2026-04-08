/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

const HEX_COLOR_REGEX = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;

const ALLOWED_TAGS = ['strong', 'em', 'a'];

/**
 * Decodes HTML entities and collapses whitespace in a string using a single pass.
 * Used to normalize URLs before protocol validation to prevent bypass attacks.
 */
const normalizeForProtocolCheck = (value: string): string => {
  // Single-pass entity decoding prevents double-unescaping (e.g., &#38;amp; → &amp; → &)
  const entityDecoded = value.replace(
    /&(?:#(\d{1,7})|#x([0-9a-fA-F]{1,6})|amp|lt|gt|quot|apos);/gi,
    (match, decimal?: string, hex?: string) => {
      if (decimal !== undefined) return String.fromCharCode(parseInt(decimal, 10));
      if (hex !== undefined) return String.fromCharCode(parseInt(hex, 16));
      switch (match.toLowerCase()) {
        case '&amp;':
          return '&';
        case '&lt;':
          return '<';
        case '&gt;':
          return '>';
        case '&quot;':
          return '"';
        case '&apos;':
          return "'";
        default:
          return match;
      }
    }
  );

  // Attempt URI decoding (may be multi-layered)
  let decoded = entityDecoded;
  try {
    decoded = decodeURIComponent(entityDecoded);
  } catch {
    // If decoding fails, use the entity-decoded value
  }

  // Collapse all whitespace (handles java\nscript: style attacks)
  return decoded.replace(/\s/g, '');
};

/**
 * Returns true if the URL uses only an allowed protocol (http, https, relative, or fragment).
 * Rejects javascript:, data:, vbscript:, and any other protocol after normalization.
 */
const isSafeHref = (href: string): boolean => {
  const normalized = normalizeForProtocolCheck(href);
  // Allow relative URLs, fragment links, and http/https only
  return (
    normalized.startsWith('/') || normalized.startsWith('#') || /^https?:\/\//i.test(normalized)
  );
};

/**
 * Sanitizes HTML content to only allow <strong>, <em>, and <a> (href only) tags.
 * Strips all other tags and attributes to prevent XSS.
 */
export const sanitizeNotificationHtml = (html: string): string => {
  // Step 1: Remove all HTML comments
  let result = html.replace(/<!--[\s\S]*?-->/g, '');

  // Step 2: Process tags - keep only allowed ones with allowed attributes
  result = result.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*\/?>/g, (match, tagName: string) => {
    const lowerTag = tagName.toLowerCase();

    if (!ALLOWED_TAGS.includes(lowerTag)) {
      return '';
    }

    // Check if it's a closing tag
    if (match.startsWith('</')) {
      return `</${lowerTag}>`;
    }

    // For <a> tags, extract only the href attribute and validate the protocol
    if (lowerTag === 'a') {
      const hrefMatch = match.match(/href\s*=\s*["']([^"']*?)["']/i);
      if (hrefMatch) {
        const href = hrefMatch[1];
        if (!isSafeHref(href)) {
          return '';
        }
        return `<a href="${href}">`;
      }
      return '<a>';
    }

    // For <strong> and <em>, strip all attributes
    return `<${lowerTag}>`;
  });

  return result.trim();
};

export const hexColorSchema = z
  .string()
  .regex(HEX_COLOR_REGEX, 'Must be a valid hex color (e.g., #ffffff or #fff)')
  .optional()
  .nullable();

/**
 * Add target="_blank" and rel="noopener noreferrer" to all <a> tags at render time.
 */
export const addLinkAttributes = (html: string): string => {
  return html.replace(/<a(\s[^>]*)?\/?>/g, (match) => {
    const cleaned = match
      .replace(/\s*target\s*=\s*["'][^"']*["']/gi, '')
      .replace(/\s*rel\s*=\s*["'][^"']*["']/gi, '')
      .replace(/\/?>$/, '');
    return `${cleaned} target="_blank" rel="noopener noreferrer">`;
  });
};

const dateField = z.preprocess(
  (val) => (val === '' || val === undefined ? null : val),
  z.coerce.date().optional().nullable()
);

export const bannerNotificationSchema = z
  .object({
    slotNumber: z.coerce.number().int().min(1).max(5),
    content: z.preprocess(
      (val) => (val === '' || val === undefined ? null : val),
      z
        .string()
        .max(500, 'Content must be 500 characters or fewer')
        .transform((val) => sanitizeNotificationHtml(val))
        .nullable()
        .optional()
    ),
    textColor: z.preprocess(
      (val) => (val === '' || val === undefined ? null : val),
      hexColorSchema
    ),
    backgroundColor: z.preprocess(
      (val) => (val === '' || val === undefined ? null : val),
      hexColorSchema
    ),
    displayFrom: dateField,
    displayUntil: dateField,
    repostedFromId: z.preprocess(
      (val) => (val === '' || val === undefined ? null : val),
      z.string().regex(OBJECT_ID_REGEX, 'Must be a valid ObjectId').optional().nullable()
    ),
  })
  .refine(
    (data) => {
      if (data.displayFrom && data.displayUntil) {
        return data.displayUntil >= data.displayFrom;
      }
      return true;
    },
    {
      message: 'End date must be on or after start date',
      path: ['displayUntil'],
    }
  );

export type BannerNotificationFormData = z.infer<typeof bannerNotificationSchema>;

export const rotationIntervalSchema = z.object({
  interval: z.coerce.number().min(3).max(15),
});

export type RotationIntervalFormData = z.infer<typeof rotationIntervalSchema>;
