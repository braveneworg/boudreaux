/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useState } from 'react';

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SubmissionTextEditor } from './submission-text-editor';

const onChangeSpy = vi.fn();

const Harness = ({
  variant,
  initialValue = '<p>Start</p>',
}: {
  variant: 'about' | 'writing';
  initialValue?: string;
}) => {
  const [value, setValue] = useState(initialValue);
  return (
    <SubmissionTextEditor
      variant={variant}
      value={value}
      onChange={(html) => {
        onChangeSpy(html);
        setValue(html);
      }}
      ariaLabel="Editor"
    />
  );
};

const waitForEditor = async (): Promise<HTMLElement> =>
  waitFor(() => screen.getByRole('textbox', { name: 'Editor' }));

const lastHtml = (): string => String(onChangeSpy.mock.calls.at(-1)?.[0] ?? '');

describe('SubmissionTextEditor', () => {
  it('offers only bold and italic for the about', async () => {
    render(<Harness variant="about" />);
    await waitForEditor();

    const toolbar = screen.getByRole('toolbar');
    expect(
      within(toolbar)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label'))
    ).toEqual(['Bold', 'Italic']);
  });

  it('adds headings and links for the writing', async () => {
    render(<Harness variant="writing" />);
    await waitForEditor();

    const toolbar = screen.getByRole('toolbar');
    expect(
      within(toolbar)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label'))
    ).toEqual(['Bold', 'Italic', 'Heading', 'Subheading', 'Link']);
  });

  it('loads the value it is given', async () => {
    render(<Harness variant="about" initialValue="<p>Written on the bus.</p>" />);

    expect(await waitForEditor()).toHaveTextContent('Written on the bus.');
  });

  it('drops a heading the about is not allowed to hold', async () => {
    render(<Harness variant="about" initialValue="<h2>Big</h2><p>text</p>" />);

    const editor = await waitForEditor();
    expect(editor.querySelector('h2')).toBeNull();
    expect(editor).toHaveTextContent('Big');
  });

  it('keeps a heading in the writing', async () => {
    render(<Harness variant="writing" initialValue="<h2>Big</h2><p>text</p>" />);

    const editor = await waitForEditor();
    expect(editor.querySelector('h2')).toHaveTextContent('Big');
  });

  it('inserts a link from the dialog and reports the new HTML', async () => {
    render(<Harness variant="writing" />);
    await waitForEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Link' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a link' });
    await userEvent.type(within(dialog).getByLabelText('Link address'), 'https://example.com/zine');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add link' }));

    await waitFor(() => expect(lastHtml()).toContain('href="https://example.com/zine"'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('refuses a link that is not an http(s) address, and says why', async () => {
    render(<Harness variant="writing" />);
    await waitForEditor();
    onChangeSpy.mockClear();

    await userEvent.click(screen.getByRole('button', { name: 'Link' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a link' });
    await userEvent.type(within(dialog).getByLabelText('Link address'), 'javascript:alert(1)');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add link' }));

    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Enter a full address that starts with http:// or https://'
    );
    expect(onChangeSpy).not.toHaveBeenCalled();
  });

  it('names the editing surface for assistive technology', async () => {
    render(<Harness variant="writing" />);

    expect(await waitForEditor()).toHaveAttribute('aria-multiline', 'true');
  });
});
