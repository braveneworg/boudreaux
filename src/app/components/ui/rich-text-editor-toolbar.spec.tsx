/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { RichTextEditorToolbar } from './rich-text-editor-toolbar';

import type { RichTextEditorImage } from './rich-text-editor';
import type { ToolbarState } from './rich-text-editor-toolbar';
import type { Editor } from '@tiptap/react';

// The toolbar never touches `editor` during render (only in click handlers),
// so a bare stub is enough to exercise its active-state rendering.
const editorStub = {} as unknown as Editor;

const IMAGES: RichTextEditorImage[] = [
  { url: 'https://cdn.fakefourrecords.com/media/artists/a/bio/0.jpg', alt: 'Portrait' },
];

const BASE_STATE: ToolbarState = {
  isBold: false,
  isItalic: false,
  isLink: false,
  isImage: false,
  isHeading2: false,
  isHeading3: false,
  isBulletList: false,
  isOrderedList: false,
};

const renderToolbar = (state: ToolbarState): void => {
  render(
    <RichTextEditorToolbar
      editor={editorStub}
      toolbarState={state}
      images={IMAGES}
      onOpenLink={() => {}}
      onOpenImage={() => {}}
      isPreview={false}
      onTogglePreview={() => {}}
    />
  );
};

describe('RichTextEditorToolbar', () => {
  it('marks the image button pressed when an image is selected', () => {
    renderToolbar({ ...BASE_STATE, isImage: true });
    expect(screen.getByRole('button', { name: 'Insert image' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('leaves the image button unpressed when no image is selected', () => {
    renderToolbar({ ...BASE_STATE, isImage: false });
    expect(screen.getByRole('button', { name: 'Insert image' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });
});
