/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useState } from 'react';

import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RichTextEditor, type RichTextEditorImage } from './rich-text-editor';

import type { Editor } from '@tiptap/react';

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

const Harness = ({
  images,
  initialValue = '<p>Start</p>',
}: {
  images?: RichTextEditorImage[];
  initialValue?: string;
}) => {
  const [value, setValue] = useState(initialValue);
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

  it('enables the insert-image button when an upload handler is provided with no images', async () => {
    const Controlled = () => {
      const [value, setValue] = useState('<p>Body</p>');
      return (
        <RichTextEditor
          value={value}
          onChange={setValue}
          images={[]}
          onUploadImage={vi.fn(async () => null)}
          ariaLabel="Bio"
        />
      );
    };
    render(<Controlled />);
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

  it('enables the link Apply button for an http(s) URL with anchor text', async () => {
    render(<Harness />);
    await waitForEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Link' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Anchor text' }), 'Click here');
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

  it('activates the image toolbar button when a figure node is selected', async () => {
    let editorInstance: Editor | null = null;
    const Controlled = () => {
      const [value, setValue] = useState(
        '<figure class="bio-figure bio-figure--center" style="width:60%"><img src="https://cdn.fakefourrecords.com/x.jpg" alt="p"></figure>'
      );
      return (
        <RichTextEditor
          value={value}
          onChange={setValue}
          images={IMAGES}
          ariaLabel="Bio"
          onEditorReady={(instance) => {
            editorInstance = instance;
          }}
        />
      );
    };
    render(<Controlled />);
    await waitForEditor();

    act(() => {
      editorInstance?.commands.setNodeSelection(0);
    });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Insert image' })).toHaveAttribute(
        'aria-pressed',
        'true'
      )
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
  it('closes the dialog when Apply is clicked with URL and anchor text', async () => {
    render(<Harness />);
    await waitForEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Link' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Anchor text' }), 'My site');
    await userEvent.type(screen.getByRole('textbox', { name: 'URL' }), 'https://example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'URL' })).not.toBeInTheDocument()
    );
  });

  it('keeps the dialog open when Remove is clicked but editLinkPos points to a stale (non-bioLink) node', async () => {
    const onChange = vi.fn();
    const Controlled = () => {
      const [value, setValue] = useState('<p><a href="https://example.com">text</a></p>');
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

    // Get the editor instance first
    const editorEl = screen.getByRole('textbox', { name: 'Bio' });
    const { editor } = editorEl as HTMLElement & { editor?: Editor };
    if (!editor) throw new Error('Tiptap editor instance not attached to element');

    // Trigger the edit dialog via the NodeView pencil button
    const editBtn = await waitFor(() => screen.getByRole('button', { name: /Edit link/i }));
    await userEvent.click(editBtn);

    // Dialog should open
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'URL' })).toHaveValue('https://example.com')
    );

    // Externally mutate the editor content so the node at editLinkPos is no longer a bioLink
    // This simulates a stale position after external edits
    onChange.mockClear();

    // Replace the entire doc with plain text (no bioLink)
    editor.chain().focus().setContent('<p>plain text</p>', { emitUpdate: false }).run();

    // Now click Remove — the command should fail silently because the node is gone
    // and the dialog should remain open
    const removeBtn = screen.getByRole('button', { name: 'Remove' });
    await userEvent.click(removeBtn);

    // Dialog should still be open because the remove failed
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'URL' })).toBeInTheDocument());
  });

  it('closes the dialog when Remove is clicked and editLinkPos points to a valid bioLink node', async () => {
    const onChange = vi.fn();
    const Controlled = () => {
      const [value, setValue] = useState('<p><a href="https://example.com">text</a></p>');
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

    // Get the editor instance
    const editorEl = screen.getByRole('textbox', { name: 'Bio' });
    const { editor } = editorEl as HTMLElement & { editor?: Editor };
    if (!editor) throw new Error('Tiptap editor instance not attached to element');

    // Trigger the edit dialog via the NodeView pencil button
    const editBtn = await waitFor(() => screen.getByRole('button', { name: /Edit link/i }));
    await userEvent.click(editBtn);

    // Dialog should open
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'URL' })).toHaveValue('https://example.com')
    );

    // Click Remove with a valid bioLink node still at editLinkPos
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));

    // Dialog should close
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'URL' })).not.toBeInTheDocument()
    );

    // Verify the link was actually removed from the HTML
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(expect.not.stringContaining('href='))
    );
  });

  it('resets editLinkPos when the dialog is dismissed via Escape or overlay', async () => {
    const onChange = vi.fn();
    const Controlled = () => {
      const [value, setValue] = useState('<p><a href="https://example.com">text</a></p>');
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

    // Trigger the edit dialog via the NodeView pencil button
    const editBtn = await waitFor(() => screen.getByRole('button', { name: /Edit link/i }));
    await userEvent.click(editBtn);

    // Dialog should open with edit-mode state
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'URL' })).toHaveValue('https://example.com')
    );

    // Dismiss the dialog via Escape
    await userEvent.keyboard('{Escape}');

    // Dialog should close
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'URL' })).not.toBeInTheDocument()
    );

    // Open the link dialog again — it should be in insert mode (not edit mode)
    // In insert mode, the URL and text fields should be empty (not pre-filled with old values)
    await userEvent.click(screen.getByRole('button', { name: 'Link' }));

    // Fields should be empty (insert mode), not pre-filled with the previous edit state
    await waitFor(() => {
      const urlField = screen.getByRole('textbox', { name: 'URL' });
      expect(urlField).toHaveValue('');
    });
  });

  it('inserts a bioLink node with the given href when inserted via dialog', async () => {
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
          ariaLabel="Bio"
        />
      );
    };
    render(<Controlled />);
    await waitForEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Link' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Anchor text' }), 'My band');
    await userEvent.type(screen.getByRole('textbox', { name: 'URL' }), 'https://example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining('href="https://example.com"'))
    );
  });

  it('closes the dialog when Remove is clicked', async () => {
    render(<Harness />);
    await waitForEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Link' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'URL' })).not.toBeInTheDocument()
    );
  });

  it('keeps the anchor-text field enabled at an empty caret (insert path)', async () => {
    render(<Harness />);
    await waitForEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Link' }));

    expect(screen.getByRole('textbox', { name: 'Anchor text' })).toBeEnabled();
  });

  it('keeps the Apply button disabled when the anchor text is empty', async () => {
    render(<Harness />);
    await waitForEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Link' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'URL' }), 'https://example.com');
    // anchor text field is empty — Apply must stay disabled

    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  });

  it('parses legacy <a> content into a bioLink node (NodeView renders the anchor text)', async () => {
    // The legacy <a> is parsed by BioLink.parseHTML into a bioLink atom node.
    // The NodeView renders the link text as a span in the live editor DOM
    // (the <a> element only appears in the serialized getHTML() output).
    const Controlled = () => {
      const [value, setValue] = useState('<p><a href="https://example.com">clickme</a></p>');
      return <RichTextEditor value={value} onChange={setValue} ariaLabel="Bio" />;
    };
    render(<Controlled />);
    await waitForEditor();

    // The NodeView renders the text label inside the editor surface.
    await waitFor(() => expect(screen.getByText('clickme')).toBeInTheDocument());
  });

  it('updates an existing bioLink node via NodeView edit path', async () => {
    const onChange = vi.fn();
    const Controlled = () => {
      const [value, setValue] = useState('<p><a href="https://old.example">text</a></p>');
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
    const editorEl = screen.getByRole('textbox', { name: 'Bio' });
    const { editor } = editorEl as HTMLElement & { editor?: Editor };
    if (!editor) throw new Error('Tiptap editor instance not attached to element');

    // Click the pencil edit button rendered by BioLinkNodeView
    const editBtn = await waitFor(() => screen.getByRole('button', { name: /Edit link/i }));
    await userEvent.click(editBtn);

    // Dialog should open pre-filled with the existing href
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'URL' })).toHaveValue('https://old.example')
    );

    const urlField = screen.getByRole('textbox', { name: 'URL' });
    await userEvent.clear(urlField);
    await userEvent.type(urlField, 'https://new.example');
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining('href="https://new.example"'))
    );
    // text label unchanged
    const lastHtml = onChange.mock.calls.at(-1)?.[0] as string;
    expect(lastHtml.match(/text/g)).toHaveLength(1);
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
  it('inserts a picked image as a bio figure block', async () => {
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
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining('class="bio-figure'))
    );
  });

  it('upgrades a bare <img> in the incoming HTML value into an editable figure', async () => {
    const Controlled = () => {
      const [value, setValue] = useState(
        '<p><img src="https://cdn.fakefourrecords.com/x.jpg" alt="P"></p>'
      );
      return <RichTextEditor value={value} onChange={setValue} ariaLabel="Bio" />;
    };
    render(<Controlled />);
    await waitForEditor();

    // Legacy bare <img> content is adopted into a bioFigure node, so it renders
    // inside a figure.bio-figure that carries the resize/float/remove controls.
    const image = await waitFor(() => {
      const node = screen
        .getByRole('textbox', { name: 'Bio' })
        .querySelector('figure.bio-figure img');
      if (!node) throw new Error('figure image not rendered yet');
      return node;
    });

    expect(image).toHaveAttribute('src', 'https://cdn.fakefourrecords.com/x.jpg');
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

describe('RichTextEditor bio figures and upgraded dialogs', () => {
  const FIGURE_HTML =
    '<figure class="bio-figure bio-figure--center" style="width:60%">' +
    '<img src="https://cdn.fakefourrecords.com/media/artists/a/bio/0.jpg" alt="Portrait">' +
    '<figcaption class="bio-figure-caption">' +
    '<span class="bio-figure-attribution">Wikimedia Commons</span>' +
    '</figcaption></figure>';

  const ControlledFactory = (onChange: (html: string) => void, initial = '<p>Body</p>') => {
    const Controlled = () => {
      const [value, setValue] = useState(initial);
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
    return Controlled;
  };

  it('registers the bioFigure node so figure content round-trips', async () => {
    render(<Harness initialValue={FIGURE_HTML} />);
    await waitForEditor();

    // The NodeView renders the caption text inside the editor surface, plus its
    // resize handle — proof the figure parsed as a bioFigure node, not as text
    // lifted out of an unknown tag.
    expect(screen.getByText('Wikimedia Commons')).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Resize image' })).toBeInTheDocument();
  });

  it('inserts a link with anchor text from the upgraded link dialog', async () => {
    const onChange = vi.fn();
    const Controlled = ControlledFactory(onChange);
    render(<Controlled />);
    await waitForEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Link' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Anchor text' }), 'My band');
    await userEvent.type(
      screen.getByRole('textbox', { name: 'URL' }),
      'https://myband.example.com'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining('>My band</a>'))
    );
  });

  it('marks the new-tab switch off automatically for a site-relative URL', async () => {
    render(<Harness />);
    await waitForEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Link' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'URL' }), '/tours');

    expect(screen.getByRole('switch', { name: 'Opens in new tab' })).toHaveAttribute(
      'aria-checked',
      'false'
    );
  });

  it('applies internal link attributes when the external toggle is off', async () => {
    const onChange = vi.fn();
    const Controlled = ControlledFactory(onChange, '<p>linkme</p>');
    render(<Controlled />);
    await waitForEditor();
    const editorEl = screen.getByRole('textbox', { name: 'Bio' });
    editorEl.focus();
    await userEvent.keyboard('{Control>}a{/Control}');

    await userEvent.click(screen.getByRole('button', { name: 'Link' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'URL' }), '/releases/first');
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining('href="/releases/first"'))
    );
    const lastHtml = onChange.mock.calls.at(-1)?.[0] as string;
    expect(lastHtml).not.toContain('target="_blank"');
  });

  it('lets the admin override the auto-set new-tab switch', async () => {
    render(<Harness />);
    await waitForEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Link' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'URL' }), 'https://example.com');
    await userEvent.click(screen.getByRole('switch', { name: 'Opens in new tab' }));

    expect(screen.getByRole('switch', { name: 'Opens in new tab' })).toHaveAttribute(
      'aria-checked',
      'false'
    );
  });

  it('inserts a bioFigure with attribution from the upgraded image dialog', async () => {
    const onChange = vi.fn();
    const Controlled = ControlledFactory(onChange);
    render(<Controlled />);
    await waitForEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Insert image' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Attribution' }), 'Wikimedia Commons');
    await userEvent.click(screen.getByRole('button', { name: 'Insert Portrait' }));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining('bio-figure-attribution'))
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
