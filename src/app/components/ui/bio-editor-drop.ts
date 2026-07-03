/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  BIO_IMAGE_DRAG_MIME,
  BIO_LINK_DRAG_MIME,
  bioImageDragPayloadSchema,
  bioLinkDragPayloadSchema,
} from '@/lib/validation/bio-dnd-schema';
import type { BioLinkDragPayload } from '@/lib/validation/bio-dnd-schema';

import type { Editor } from '@tiptap/core';

/** The slice of EditorView the drop handler needs — kept structural so tests
 *  can stub it without a real ProseMirror view. */
interface DropCoordsView {
  posAtCoords: (coords: { left: number; top: number }) => { pos: number } | null;
}

/** Parses the drag payload for `mime` off the event; null when absent/invalid JSON. */
const readPayload = (event: DragEvent, mime: string): unknown => {
  try {
    return JSON.parse(event.dataTransfer?.getData(mime) ?? '');
  } catch {
    return null;
  }
};

const linkMarkAttrs = (payload: BioLinkDragPayload): Record<string, string | null> =>
  payload.isExternal
    ? { href: payload.url, target: '_blank', rel: 'nofollow noopener noreferrer' }
    : { href: payload.url, target: null, rel: null };

const insertLinkAt = (editor: Editor, pos: number, payload: BioLinkDragPayload): void => {
  editor
    .chain()
    .focus()
    .insertContentAt(pos, {
      type: 'text',
      text: payload.label,
      marks: [{ type: 'link', attrs: linkMarkAttrs(payload) }],
    })
    .run();
};

/**
 * editorProps.handleDrop for the bio editors: accepts the two palette drag
 * payloads (validated with zod — drag data is external input) and inserts a
 * linked text run or a bioFigure at the pointer position. Returns false for
 * anything else so ProseMirror's native drag (node moves, plain text) is
 * untouched.
 */
export const handleBioEditorDrop = (
  editor: Editor,
  view: DropCoordsView,
  event: DragEvent,
  moved: boolean
): boolean => {
  if (moved || !event.dataTransfer) return false;
  const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
  if (!coords) return false;

  const linkParsed = bioLinkDragPayloadSchema.safeParse(readPayload(event, BIO_LINK_DRAG_MIME));
  if (linkParsed.success) {
    event.preventDefault();
    insertLinkAt(editor, coords.pos, linkParsed.data);
    return true;
  }

  const imageParsed = bioImageDragPayloadSchema.safeParse(readPayload(event, BIO_IMAGE_DRAG_MIME));
  if (imageParsed.success) {
    event.preventDefault();
    editor
      .chain()
      .focus()
      .insertContentAt(coords.pos, {
        type: 'bioFigure',
        attrs: {
          src: imageParsed.data.url,
          alt: imageParsed.data.alt,
          title: imageParsed.data.title,
          attribution: imageParsed.data.attribution,
        },
      })
      .run();
    return true;
  }

  return false;
};
