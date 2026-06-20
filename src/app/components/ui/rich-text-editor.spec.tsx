/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useState } from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RichTextEditor, type RichTextEditorImage } from './rich-text-editor';

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span data-testid="picker-image" data-src={src} data-alt={alt} />
  ),
}));

const IMAGES: RichTextEditorImage[] = [
  {
    url: 'https://cdn.fakefourrecords.com/media/artists/a/bio/0.jpg',
    alt: 'Portrait',
    width: 800,
    height: 600,
  },
];

const Harness = ({ images }: { images?: RichTextEditorImage[] }) => {
  const [value, setValue] = useState('<p>Start</p>');
  return <RichTextEditor value={value} onChange={setValue} images={images} ariaLabel="Bio" />;
};

const waitForEditor = async (): Promise<void> => {
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Bio' })).toBeInTheDocument());
};

describe('RichTextEditor', () => {
  it('renders the formatting toolbar once the editor is ready', async () => {
    render(<Harness />);
    await waitForEditor();

    expect(screen.getByRole('button', { name: 'Bold' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Italic' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Font size' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New paragraph' })).toBeInTheDocument();
  });

  it('disables the insert-image button when there are no images', async () => {
    render(<Harness images={[]} />);
    await waitForEditor();

    expect(screen.getByRole('button', { name: 'Insert image' })).toBeDisabled();
  });

  it('enables the insert-image button when images are available', async () => {
    render(<Harness images={IMAGES} />);
    await waitForEditor();

    expect(screen.getByRole('button', { name: 'Insert image' })).toBeEnabled();
  });

  it('opens the link dialog from the toolbar', async () => {
    render(<Harness />);
    await waitForEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Link' }));

    expect(screen.getByRole('textbox', { name: 'URL' })).toBeInTheDocument();
  });

  it('keeps the link Apply button disabled for a non-http URL', async () => {
    render(<Harness />);
    await waitForEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Link' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'URL' }), 'javascript:alert(1)');

    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  });

  it('enables the link Apply button for an http(s) URL', async () => {
    render(<Harness />);
    await waitForEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Link' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'URL' }), 'https://example.com');

    expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
  });

  it('shows the font-size presets in the dropdown', async () => {
    render(<Harness />);
    await waitForEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Font size' }));

    expect(screen.getByRole('menuitem', { name: 'Large' })).toBeInTheDocument();
  });

  it('reflects external value changes into the editor', async () => {
    const External = () => {
      const [value, setValue] = useState('<p>First</p>');
      return (
        <>
          <button type="button" onClick={() => setValue('<p>Second</p>')}>
            set
          </button>
          <RichTextEditor value={value} onChange={setValue} ariaLabel="Bio" />
        </>
      );
    };
    render(<External />);
    await waitForEditor();
    expect(screen.getByRole('textbox', { name: 'Bio' })).toHaveTextContent('First');

    await userEvent.click(screen.getByRole('button', { name: 'set' }));

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Bio' })).toHaveTextContent('Second')
    );
  });

  it('inserts a chosen image into the bio HTML', async () => {
    const onChange = vi.fn();
    const Controlled = () => {
      const [value, setValue] = useState('<p>Body</p>');
      return (
        <RichTextEditor
          value={value}
          onChange={(html) => {
            setValue(html);
            onChange(html);
          }}
          images={IMAGES}
          ariaLabel="Bio"
        />
      );
    };
    render(<Controlled />);
    await waitForEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Insert image' }));
    await userEvent.click(screen.getByRole('button', { name: 'Insert Portrait' }));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.stringContaining('src="https://cdn.fakefourrecords.com/media/artists/a/bio/0.jpg"')
      )
    );
  });
});

// ProseMirror's coordsAtPos (reached via scrollToSelection on insert) builds a
// Range and calls getClientRects() on it. jsdom leaves both Range rect methods
// undefined, so the editor throws "target.getClientRects is not a function"
// asynchronously after the test completes — a flaky unhandled exception that
// fails the whole shard. setupTests.ts polyfills them; this locks that in.
describe('jsdom Range rect polyfill (prevents prosemirror flake)', () => {
  it('exposes a callable Range.getClientRects returning an array-like with length', () => {
    const rects = globalThis.document.createRange().getClientRects();

    expect(typeof rects.length).toBe('number');
  });

  it('exposes a callable Range.getBoundingClientRect returning a rect', () => {
    const rect = globalThis.document.createRange().getBoundingClientRect();

    expect(rect).toMatchObject({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
  });
});
