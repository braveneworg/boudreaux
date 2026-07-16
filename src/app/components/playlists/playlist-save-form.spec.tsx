/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ComponentProps } from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { PlaylistDetailResponse } from '@/lib/types/domain/playlist';

import { PlaylistSaveForm } from './playlist-save-form';

const submitSaveMock = vi.hoisted(() => vi.fn());
const isSavingRef = vi.hoisted(() => ({ current: false }));

vi.mock('./use-playlist-save-submit', () => ({
  usePlaylistSaveSubmit: () => ({
    isSaving: isSavingRef.current,
    submitSave: submitSaveMock,
  }),
}));

interface FieldStubProps {
  value: string[];
  onChange: (value: string[]) => void;
  playlistId: string | null;
  availableArtistImages: string[];
  pendingFiles: File[];
  onPendingFilesChange: (files: File[]) => void;
}

vi.mock('./playlist-cover-art-field', () => ({
  PlaylistCoverArtField: ({ playlistId }: FieldStubProps) => (
    <div data-testid="cover-art-field" data-playlist-id={playlistId ?? 'none'} />
  ),
}));

type FormProps = ComponentProps<typeof PlaylistSaveForm>;
type User = ReturnType<typeof userEvent.setup>;

const renderForm = (overrides: Partial<FormProps> = {}) => {
  const props: FormProps = {
    variant: 'dialog',
    mode: 'create',
    playlistId: null,
    initialValues: { title: '', isPublic: false, coverImages: [] },
    pendingItemRefs: [],
    availableArtistImages: [],
    onSaved: vi.fn(),
    ...overrides,
  };
  return { ...render(<PlaylistSaveForm {...props} />), props };
};

const clickSave = async (user: User): Promise<void> =>
  user.click(screen.getByRole('button', { name: 'Save' }));

beforeEach(() => {
  isSavingRef.current = false;
  submitSaveMock.mockResolvedValue(undefined);
});

describe('PlaylistSaveForm', () => {
  describe('variant="dialog"', () => {
    it('renders the Title input', () => {
      renderForm({ variant: 'dialog' });

      expect(screen.getByLabelText('Title')).toBeInTheDocument();
    });

    it('renders the Public switch', () => {
      renderForm({ variant: 'dialog' });

      expect(screen.getByRole('switch', { name: 'Public playlist' })).toBeInTheDocument();
    });

    it('renders a Save button', () => {
      renderForm({ variant: 'dialog' });

      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    });

    it('calls submitSave with the typed title on submit', async () => {
      const user = userEvent.setup();
      renderForm({ variant: 'dialog' });

      await user.type(screen.getByLabelText('Title'), 'Road Trip');
      await clickSave(user);

      await waitFor(() =>
        expect(submitSaveMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: 'Road Trip', isPublic: false, coverImages: [] }),
          []
        )
      );
    });
  });

  describe('variant="inline" footer', () => {
    it('renders the Save button', () => {
      renderForm({ variant: 'inline', mode: 'edit', playlistId: '507f191e810c19729de860ec' });

      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    });

    it('omits the Cancel button', () => {
      renderForm({
        variant: 'inline',
        onCancel: vi.fn(),
        mode: 'edit',
        playlistId: '507f191e810c19729de860ec',
      });

      expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    });

    it('omits the Add songs button even in edit mode with a handler', () => {
      renderForm({
        variant: 'inline',
        mode: 'edit',
        playlistId: '507f191e810c19729de860ec',
        onAddSongs: vi.fn(),
      });

      expect(screen.queryByRole('button', { name: 'Add songs' })).not.toBeInTheDocument();
    });
  });

  describe('onSavingChange', () => {
    it('reports the current saving state to the parent', () => {
      isSavingRef.current = true;
      const onSavingChange = vi.fn();
      renderForm({ variant: 'dialog', onSavingChange });

      expect(onSavingChange).toHaveBeenCalledWith(true);
    });
  });

  describe('onSaved is threaded through the submit hook', () => {
    it('accepts an onSaved callback prop', () => {
      const onSaved = vi.fn<(playlist: PlaylistDetailResponse) => void>();
      renderForm({ variant: 'dialog', onSaved });

      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    });
  });
});
