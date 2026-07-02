/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useState } from 'react';

import { render, screen, waitFor, within } from '@testing-library/react';
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

  it('renders the H2 and H3 heading buttons in the toolbar', async () => {
    render(<Harness />);
    await waitForEditor();

    expect(screen.getByRole('button', { name: 'Heading 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Heading 3' })).toBeInTheDocument();
  });

  it('renders the bulleted and numbered list buttons in the toolbar', async () => {
    render(<Harness />);
    await waitForEditor();

    expect(screen.getByRole('button', { name: 'Bulleted list' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Numbered list' })).toBeInTheDocument();
  });

  it('converts the current block into a bulleted list when clicked', async () => {
    const onChange = vi.fn();
    const Controlled = () => {
      const [value, setValue] = useState('<p>Item</p>');
      return (
        <RichTextEditor
          value={value}
          onChange={(html) => {
            setValue(html);
            onChange(html);
          }}
          ariaLabel="Bio"
        />
      );
    };
    render(<Controlled />);
    await waitForEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Bulleted list' }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.stringContaining('<ul>')));
  });

  it('wraps the current block in an h2 when the Heading 2 button is clicked', async () => {
    const onChange = vi.fn();
    const Controlled = () => {
      const [value, setValue] = useState('<p>Career</p>');
      return (
        <RichTextEditor
          value={value}
          onChange={(html) => {
            setValue(html);
            onChange(html);
          }}
          ariaLabel="Bio"
        />
      );
    };
    render(<Controlled />);
    await waitForEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Heading 2' }));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining('<h2>Career</h2>'))
    );
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

describe('RichTextEditor toolbar handlers and branches', () => {
  it('toggles bold via the toolbar and marks the button pressed', async () => {
    const Controlled = () => {
      const [value, setValue] = useState('<p>Loud</p>');
      return <RichTextEditor value={value} onChange={setValue} ariaLabel="Bio" />;
    };
    render(<Controlled />);
    await waitForEditor();

    // The button's onClick focuses the editor and toggles the stored bold mark
    // on the (default) collapsed selection, flipping the active state to true.
    await userEvent.click(screen.getByRole('button', { name: 'Bold' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true')
    );
  });

  it('toggles italic via the toolbar and marks the button pressed', async () => {
    const Controlled = () => {
      const [value, setValue] = useState('<p>Slant</p>');
      return <RichTextEditor value={value} onChange={setValue} ariaLabel="Bio" />;
    };
    render(<Controlled />);
    await waitForEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Italic' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Italic' })).toHaveAttribute('aria-pressed', 'true')
    );
  });

  it('wraps the current block in an h3 when the Heading 3 button is clicked', async () => {
    const onChange = vi.fn();
    const Controlled = () => {
      const [value, setValue] = useState('<p>Sub</p>');
      return (
        <RichTextEditor
          value={value}
          onChange={(html) => {
            setValue(html);
            onChange(html);
          }}
          ariaLabel="Bio"
        />
      );
    };
    render(<Controlled />);
    await waitForEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Heading 3' }));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining('<h3>Sub</h3>'))
    );
  });

  it('converts the current block into a numbered list when clicked', async () => {
    const onChange = vi.fn();
    const Controlled = () => {
      const [value, setValue] = useState('<p>Item</p>');
      return (
        <RichTextEditor
          value={value}
          onChange={(html) => {
            setValue(html);
            onChange(html);
          }}
          ariaLabel="Bio"
        />
      );
    };
    render(<Controlled />);
    await waitForEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Numbered list' }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.stringContaining('<ol>')));
  });

  it('inserts a new empty paragraph when the New paragraph button is clicked', async () => {
    const onChange = vi.fn();
    const Controlled = () => {
      const [value, setValue] = useState('<p>One</p>');
      return (
        <RichTextEditor
          value={value}
          onChange={(html) => {
            setValue(html);
            onChange(html);
          }}
          ariaLabel="Bio"
        />
      );
    };
    render(<Controlled />);
    await waitForEditor();

    await userEvent.click(screen.getByRole('button', { name: 'New paragraph' }));

    await waitFor(() => expect(onChange).toHaveBeenCalled());
  });

  it('applies a font-size preset from the dropdown', async () => {
    const Controlled = () => {
      const [value, setValue] = useState('<p>Sized</p>');
      return <RichTextEditor value={value} onChange={setValue} ariaLabel="Bio" />;
    };
    render(<Controlled />);
    await waitForEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Font size' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Large' }));

    // The setFontSize command runs through .focus() on the collapsed selection
    // and the dropdown closes without error.
    await waitFor(() =>
      expect(screen.queryByRole('menuitem', { name: 'Large' })).not.toBeInTheDocument()
    );
  });

  it('resets the font size via the dropdown Reset item', async () => {
    const Controlled = () => {
      const [value, setValue] = useState('<p>Reset me</p>');
      return <RichTextEditor value={value} onChange={setValue} ariaLabel="Bio" />;
    };
    render(<Controlled />);
    await waitForEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Font size' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Reset' }));

    await waitFor(() =>
      expect(screen.queryByRole('menuitem', { name: 'Reset' })).not.toBeInTheDocument()
    );
  });
});

describe('RichTextEditor link dialog handlers', () => {
  it('applies an http link to the selected text and closes the dialog', async () => {
    const onChange = vi.fn();
    const Controlled = () => {
      const [value, setValue] = useState('<p>linkme</p>');
      return (
        <RichTextEditor
          value={value}
          onChange={(html) => {
            setValue(html);
            onChange(html);
          }}
          ariaLabel="Bio"
        />
      );
    };
    render(<Controlled />);
    await waitForEditor();
    // Focus the editor (no mouse coords) and select all via keyboard so the
    // applied link wraps real text and serializes an href.
    const editorEl = screen.getByRole('textbox', { name: 'Bio' });
    editorEl.focus();
    await userEvent.keyboard('{Control>}a{/Control}');

    await userEvent.click(screen.getByRole('button', { name: 'Link' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'URL' }), 'https://example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'URL' })).not.toBeInTheDocument()
    );
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining('href="https://example.com"'))
    );
  });

  it('removes a link via the Remove button and closes the dialog', async () => {
    const onChange = vi.fn();
    const Controlled = () => {
      const [value, setValue] = useState('<p><a href="https://example.com">x</a></p>');
      return (
        <RichTextEditor
          value={value}
          onChange={(html) => {
            setValue(html);
            onChange(html);
          }}
          ariaLabel="Bio"
        />
      );
    };
    render(<Controlled />);
    await waitForEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Link' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'URL' })).not.toBeInTheDocument()
    );
  });

  it('prefills the link dialog with the active link href', async () => {
    const Controlled = () => {
      const [value, setValue] = useState('<p><a href="https://prefilled.test/">x</a></p>');
      return <RichTextEditor value={value} onChange={setValue} ariaLabel="Bio" />;
    };
    render(<Controlled />);
    await waitForEditor();
    // Focus the editor and move the cursor right (into the link text) via
    // keyboard so getAttributes('link').href resolves — no mouse coords needed.
    const editorEl = screen.getByRole('textbox', { name: 'Bio' });
    editorEl.focus();
    await userEvent.keyboard('{Control>}a{/Control}');

    await userEvent.click(screen.getByRole('button', { name: 'Link' }));

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'URL' })).toHaveValue('https://prefilled.test/')
    );
  });
});

describe('RichTextEditor active toolbar state and props', () => {
  it('marks the Heading 2 button pressed after converting a block to h2', async () => {
    const Controlled = () => {
      const [value, setValue] = useState('<p>Title</p>');
      return <RichTextEditor value={value} onChange={setValue} ariaLabel="Bio" />;
    };
    render(<Controlled />);
    await waitForEditor();

    // Toggling the heading runs a transaction and leaves the cursor inside the
    // new h2, so useEditorState recomputes the active state to true.
    await userEvent.click(screen.getByRole('button', { name: 'Heading 2' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Heading 2' })).toHaveAttribute(
        'aria-pressed',
        'true'
      )
    );
  });

  it('falls back to the default aria-label and applies the id when none provided', async () => {
    const Plain = () => {
      const [value, setValue] = useState('<p>Default</p>');
      return <RichTextEditor value={value} onChange={setValue} id="my-bio" />;
    };
    render(<Plain />);

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Bio editor' })).toBeInTheDocument()
    );
    expect(screen.getByRole('textbox', { name: 'Bio editor' })).toHaveAttribute('id', 'my-bio');
  });
});

describe('RichTextEditor image attributes and picker', () => {
  it('persists width and height for an image set into the content', async () => {
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
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining('width="800"'))
    );
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining('height="600"'))
    );
  });

  it('parses and renders width/height off an <img> in the incoming HTML value', async () => {
    const Controlled = () => {
      const [value, setValue] = useState(
        '<p><img src="https://cdn.fakefourrecords.com/x.jpg" alt="P" width="320" height="240"></p>'
      );
      return <RichTextEditor value={value} onChange={setValue} ariaLabel="Bio" />;
    };
    render(<Controlled />);
    await waitForEditor();

    // BioEditorImage.parseHTML reads width/height off the incoming markup and
    // renderHTML writes them back onto the DOM node the editor displays.
    const img = await waitFor(() => {
      const node = screen.getByRole('textbox', { name: 'Bio' }).querySelector('img');
      if (!node) throw new Error('image not rendered yet');
      return node;
    });

    expect(img).toHaveAttribute('width', '320');
  });

  it('inserts an image with a null alt using fallbacks for label and alt', async () => {
    const onChange = vi.fn();
    const noAltImages: RichTextEditorImage[] = [
      { url: 'https://cdn.fakefourrecords.com/media/artists/a/bio/1.jpg', alt: null },
    ];
    const Controlled = () => {
      const [value, setValue] = useState('<p>Body</p>');
      return (
        <RichTextEditor
          value={value}
          onChange={(html) => {
            setValue(html);
            onChange(html);
          }}
          images={noAltImages}
          ariaLabel="Bio"
        />
      );
    };
    render(<Controlled />);
    await waitForEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Insert image' }));
    // The picker button falls back to "Insert image" too when alt is null; scope
    // to the dialog to pick the thumbnail, not the toolbar trigger.
    const dialog = await screen.findByRole('dialog', { name: 'Insert image' });
    const { getByRole: getInDialog } = within(dialog);
    await userEvent.click(getInDialog('button', { name: 'Insert image' }));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.stringContaining('src="https://cdn.fakefourrecords.com/media/artists/a/bio/1.jpg"')
      )
    );
  });
});

describe('RichTextEditor preview mode', () => {
  const RICH_VALUE =
    '<p>Visit <a href="https://example.com">the official site</a></p>' +
    '<img src="https://cdn.fakefourrecords.com/media/artists/a/bio/0.jpg" alt="Portrait" width="800" height="600">';

  const PreviewHarness = () => {
    const [value, setValue] = useState(RICH_VALUE);
    return <RichTextEditor value={value} onChange={setValue} ariaLabel="Bio" />;
  };

  it('renders an unpressed Preview toggle in the toolbar', async () => {
    render(<PreviewHarness />);
    await waitForEditor();

    expect(screen.getByRole('button', { name: 'Preview' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('shows the rendered output with real links and images when toggled on', async () => {
    render(<PreviewHarness />);
    await waitForEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));

    const preview = screen.getByRole('region', { name: 'Bio preview' });
    expect(within(preview).getByRole('link', { name: 'the official site' })).toHaveAttribute(
      'href',
      'https://example.com'
    );
    expect(within(preview).getByTestId('picker-image')).toHaveAttribute(
      'data-src',
      'https://cdn.fakefourrecords.com/media/artists/a/bio/0.jpg'
    );
  });

  it('hides the editing surface while previewing and restores it when toggled off', async () => {
    render(<PreviewHarness />);
    await waitForEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    // The hidden editing surface drops out of the accessibility tree entirely;
    // `hidden: true` lets the query reach it to assert it is not visible.
    expect(screen.getByRole('textbox', { name: 'Bio', hidden: true })).not.toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByRole('textbox', { name: 'Bio' })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Bio preview' })).not.toBeInTheDocument();
  });

  it('disables the formatting controls while previewing', async () => {
    render(<PreviewHarness />);
    await waitForEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));

    expect(screen.getByRole('button', { name: 'Bold' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Link' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Preview' })).toBeEnabled();
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
