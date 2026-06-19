/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Prepares a stored bio value for the rich-text editor. Values authored in the
 * editor are already HTML and pass through untouched; legacy bios stored as
 * plain text (with literal newlines) would otherwise collapse onto one line
 * when loaded into Tiptap, so they are escaped and converted to paragraphs —
 * blank lines split paragraphs and single newlines become `<br>` — preserving
 * the original structure round-trip.
 *
 * @param value - The stored bio field (HTML or legacy plain text), or nullish.
 * @returns HTML suitable for the editor's initial content (empty string when
 * the value is empty).
 */
export const plainTextToBioHtml = (value: string | null | undefined): string => {
  if (!value) return '';

  // Already HTML (editor output) — leave it as-is.
  if (/<[a-z][\s\S]*>/i.test(value)) return value;

  return value
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
};
