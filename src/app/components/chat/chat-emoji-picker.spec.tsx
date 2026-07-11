// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ChatEmojiPicker } from './chat-emoji-picker';

// The inner picker is lazy-loaded through next/dynamic; mock the underlying
// module so the real loader resolves to a light stub that can fire onSelect.
vi.mock('./chat-emoji-picker-inner', () => ({
  ChatEmojiPickerInner: ({ onSelect }: { onSelect: (emoji: string) => void }) => (
    <button type="button" onClick={() => onSelect('🔥')}>
      pick-fire
    </button>
  ),
}));

const renderPicker = (onSelect: (emoji: string) => void = vi.fn()) =>
  render(
    <ChatEmojiPicker
      trigger={
        <button type="button" aria-label="Add reaction">
          react
        </button>
      }
      onSelect={onSelect}
    />
  );

describe('ChatEmojiPicker', () => {
  it('opens the picker popover from the trigger', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    renderPicker();

    await user.click(screen.getByRole('button', { name: 'Add reaction' }));

    expect(await screen.findByRole('button', { name: 'pick-fire' })).toBeInTheDocument();
  });

  it('is modal while open: outside pointer events are disabled', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    renderPicker();

    await user.click(screen.getByRole('button', { name: 'Add reaction' }));
    await screen.findByRole('button', { name: 'pick-fire' });

    // Radix modal popovers disable pointer events outside the layer, which
    // also pauses the chat drawer's trapped FocusScope — without this the
    // drawer steals focus from the picker's search input (the popover
    // content portals outside the drawer's DOM subtree).
    expect(document.body.style.pointerEvents).toBe('none');
  });

  it('forwards the picked emoji to onSelect, closes, and restores pointer events', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    const onSelect = vi.fn();
    renderPicker(onSelect);

    await user.click(screen.getByRole('button', { name: 'Add reaction' }));
    await user.click(await screen.findByRole('button', { name: 'pick-fire' }));

    expect(onSelect).toHaveBeenCalledWith('🔥');
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'pick-fire' })).not.toBeInTheDocument()
    );
    await waitFor(() => expect(document.body.style.pointerEvents).not.toBe('none'));
  });
});
