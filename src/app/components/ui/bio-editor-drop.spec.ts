/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BIO_IMAGE_DRAG_MIME, BIO_LINK_DRAG_MIME } from '@/lib/validation/bio-dnd-schema';

import { handleBioEditorDrop } from './bio-editor-drop';

import type { Editor } from '@tiptap/core';

const IMAGE_PAYLOAD = {
  url: 'https://cdn.example/photo.jpg',
  thumbnailUrl: null,
  title: 'Live at the Vera Project',
  attribution: 'Photo by Example',
  alt: 'Artist on stage',
  width: 1024,
  height: 768,
};

const LINK_PAYLOAD = {
  label: 'Wikipedia',
  url: 'https://en.wikipedia.org/wiki/X',
  kind: 'wikipedia',
  isExternal: true,
};

interface EditorStub {
  editor: Editor;
  insertContentAt: ReturnType<typeof vi.fn>;
}

const makeEditor = (): EditorStub => {
  const insertContentAt = vi.fn();
  const chainable = {
    focus: vi.fn(),
    insertContentAt,
    run: vi.fn().mockReturnValue(true),
  };
  chainable.focus.mockReturnValue(chainable);
  insertContentAt.mockReturnValue(chainable);
  return { editor: { chain: () => chainable } as unknown as Editor, insertContentAt };
};

interface ViewStub {
  posAtCoords: (coords: { left: number; top: number }) => { pos: number; inside: number } | null;
}

const makeView = (pos: number | null = 7): ViewStub => ({
  posAtCoords: vi
    .fn<ViewStub['posAtCoords']>()
    .mockReturnValue(pos === null ? null : { pos, inside: 0 }),
});

const makeDropEvent = (data: Record<string, string>): DragEvent => {
  const entries = new Map(Object.entries(data));
  return {
    dataTransfer: { getData: (type: string) => entries.get(type) ?? '' },
    clientX: 10,
    clientY: 20,
    preventDefault: vi.fn(),
  } as unknown as DragEvent;
};

describe('handleBioEditorDrop', () => {
  it('ignores an in-editor node move', () => {
    const { editor } = makeEditor();
    expect(handleBioEditorDrop(editor, makeView(), makeDropEvent({}), true)).toBe(false);
  });

  it('ignores a drop without a dataTransfer', () => {
    const { editor } = makeEditor();
    const event = { dataTransfer: null, clientX: 10, clientY: 20 } as unknown as DragEvent;
    expect(handleBioEditorDrop(editor, makeView(), event, false)).toBe(false);
  });

  it('ignores a drop with no palette payload', () => {
    const { editor } = makeEditor();
    expect(handleBioEditorDrop(editor, makeView(), makeDropEvent({}), false)).toBe(false);
  });

  it('ignores a drop whose position cannot be resolved', () => {
    const { editor } = makeEditor();
    const event = makeDropEvent({ [BIO_LINK_DRAG_MIME]: JSON.stringify(LINK_PAYLOAD) });
    expect(handleBioEditorDrop(editor, makeView(null), event, false)).toBe(false);
  });

  it('consumes a link payload drop', () => {
    const { editor } = makeEditor();
    const event = makeDropEvent({ [BIO_LINK_DRAG_MIME]: JSON.stringify(LINK_PAYLOAD) });
    expect(handleBioEditorDrop(editor, makeView(), event, false)).toBe(true);
  });

  it('prevents the browser default on a consumed drop', () => {
    const { editor } = makeEditor();
    const event = makeDropEvent({ [BIO_LINK_DRAG_MIME]: JSON.stringify(LINK_PAYLOAD) });
    handleBioEditorDrop(editor, makeView(), event, false);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('inserts linked text at the drop position for a link payload', () => {
    const { editor, insertContentAt } = makeEditor();
    const event = makeDropEvent({ [BIO_LINK_DRAG_MIME]: JSON.stringify(LINK_PAYLOAD) });
    handleBioEditorDrop(editor, makeView(), event, false);
    expect(insertContentAt).toHaveBeenCalledWith(7, {
      type: 'text',
      text: 'Wikipedia',
      marks: [
        {
          type: 'link',
          attrs: {
            href: 'https://en.wikipedia.org/wiki/X',
            target: '_blank',
            rel: 'nofollow noopener noreferrer',
          },
        },
      ],
    });
  });

  it('inserts an internal link without new-tab attributes', () => {
    const { editor, insertContentAt } = makeEditor();
    const event = makeDropEvent({
      [BIO_LINK_DRAG_MIME]: JSON.stringify({
        label: 'First Release',
        url: '/releases/first',
        kind: 'release',
        isExternal: false,
      }),
    });
    handleBioEditorDrop(editor, makeView(), event, false);
    expect(insertContentAt).toHaveBeenCalledWith(7, {
      type: 'text',
      text: 'First Release',
      marks: [
        {
          type: 'link',
          attrs: { href: '/releases/first', target: null, rel: null },
        },
      ],
    });
  });

  it('inserts a bioFigure for an image payload', () => {
    const { editor, insertContentAt } = makeEditor();
    const event = makeDropEvent({ [BIO_IMAGE_DRAG_MIME]: JSON.stringify(IMAGE_PAYLOAD) });
    expect(handleBioEditorDrop(editor, makeView(), event, false)).toBe(true);
    expect(insertContentAt).toHaveBeenCalledWith(7, {
      type: 'bioFigure',
      attrs: expect.objectContaining({
        src: IMAGE_PAYLOAD.url,
        attribution: IMAGE_PAYLOAD.attribution,
      }),
    });
  });

  it('rejects a malformed payload without inserting', () => {
    const { editor } = makeEditor();
    const event = makeDropEvent({ [BIO_LINK_DRAG_MIME]: '{"nope":true}' });
    expect(handleBioEditorDrop(editor, makeView(), event, false)).toBe(false);
  });

  it('does not insert anything for a malformed payload', () => {
    const { editor, insertContentAt } = makeEditor();
    const event = makeDropEvent({ [BIO_LINK_DRAG_MIME]: '{"nope":true}' });
    handleBioEditorDrop(editor, makeView(), event, false);
    expect(insertContentAt).not.toHaveBeenCalled();
  });
});
