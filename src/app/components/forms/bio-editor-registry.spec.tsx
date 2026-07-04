/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { JSX } from 'react';

import { act, render } from '@testing-library/react';

import { BioEditorRegistryProvider, useBioEditorRegistry } from './bio-editor-registry';

import type { BioEditorRegistryValue } from './bio-editor-registry';
import type { Editor } from '@tiptap/react';

const fakeEditor = (name: string): Editor => ({ name }) as unknown as Editor;

describe('BioEditorRegistry', () => {
  const Probe = (): JSX.Element => {
    const registry = useBioEditorRegistry();
    return (
      <button type="button" onClick={() => registry.setActive('short')}>
        activate-short
      </button>
    );
  };

  it('getTarget returns the active editor, else the first registered', () => {
    const editors = { bio: fakeEditor('bio'), short: fakeEditor('short') };
    // Use object property so TypeScript does not narrow via let-variable callback inference.
    const box: { reg: BioEditorRegistryValue | null } = { reg: null };
    const Capture = (): null => {
      box.reg = useBioEditorRegistry();
      return null;
    };
    render(
      <BioEditorRegistryProvider>
        <Capture />
        <Probe />
      </BioEditorRegistryProvider>
    );
    act(() => {
      box.reg?.register('bio', editors.bio);
      box.reg?.register('short', editors.short);
    });
    expect(box.reg?.getTarget()).toBe(editors.bio);
    act(() => box.reg?.setActive('short'));
    expect(box.reg?.getTarget()).toBe(editors.short);
    act(() => box.reg?.unregister('short'));
    expect(box.reg?.getTarget()).toBe(editors.bio);
  });

  it('defaults to a null target outside the provider', () => {
    const box: { reg: BioEditorRegistryValue | null } = { reg: null };
    const Capture = (): null => {
      box.reg = useBioEditorRegistry();
      return null;
    };
    render(<Capture />);
    expect(box.reg?.getTarget()).toBeNull();
  });
});
