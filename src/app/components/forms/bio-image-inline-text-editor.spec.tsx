/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { BioImageInlineTextEditor } from './bio-image-inline-text-editor';

const renderEditor = (initialValue = 'Photo by Example') => {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  render(
    <BioImageInlineTextEditor
      label="Alt text"
      initialValue={initialValue}
      onSave={onSave}
      onCancel={onCancel}
    />
  );
  return { onSave, onCancel, input: screen.getByRole('textbox', { name: 'Alt text' }) };
};

describe('BioImageInlineTextEditor', () => {
  it('prefills the input with the initial value under the given label', () => {
    const { input } = renderEditor();
    expect(input).toHaveValue('Photo by Example');
  });

  it('saves the trimmed draft when Save is pressed', async () => {
    const { onSave, input } = renderEditor();
    await userEvent.clear(input);
    await userEvent.type(input, '  New credit  ');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onSave).toHaveBeenCalledWith('New credit');
  });

  it('saves on Enter', async () => {
    const { onSave, input } = renderEditor('');
    await userEvent.type(input, 'Typed{Enter}');
    expect(onSave).toHaveBeenCalledWith('Typed');
  });

  it('cancels on Escape without saving', async () => {
    const { onSave, onCancel, input } = renderEditor();
    await userEvent.type(input, '{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('cancels when Cancel is pressed', async () => {
    const { onCancel } = renderEditor();
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('enforces the 500 character cap', () => {
    const { input } = renderEditor();
    expect(input).toHaveAttribute('maxLength', '500');
  });
});
