/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { VideoFormFooter } from './video-form-footer';

const defaultDraftProps = {
  mode: 'draft' as const,
  isSubmitting: false,
  isUploading: false,
  onCancel: vi.fn(),
  onPublish: vi.fn(),
  onUnpublish: vi.fn(),
};

const defaultPublishedProps = {
  mode: 'published' as const,
  isSubmitting: false,
  isUploading: false,
  onCancel: vi.fn(),
  onPublish: vi.fn(),
  onUnpublish: vi.fn(),
};

describe('VideoFormFooter — draft mode', () => {
  it('shows Save and Publish for a draft', () => {
    render(<VideoFormFooter {...defaultDraftProps} />);

    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unpublish' })).not.toBeInTheDocument();
  });

  it('labels the Save button "Saving…" while submitting', () => {
    render(<VideoFormFooter {...defaultDraftProps} isSubmitting />);

    expect(screen.getByRole('button', { name: 'Saving…' })).toBeInTheDocument();
  });

  it('disables Save while an upload is in flight', () => {
    render(<VideoFormFooter {...defaultDraftProps} isUploading />);

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('invokes onCancel when Cancel is clicked', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<VideoFormFooter {...defaultDraftProps} onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('calls onPublish when Publish is clicked', async () => {
    const onPublish = vi.fn();
    const user = userEvent.setup();
    render(<VideoFormFooter {...defaultDraftProps} onPublish={onPublish} />);

    await user.click(screen.getByRole('button', { name: 'Publish' }));

    expect(onPublish).toHaveBeenCalledOnce();
  });
});

describe('VideoFormFooter — published mode', () => {
  it('shows Save and Unpublish for a published video', () => {
    render(<VideoFormFooter {...defaultPublishedProps} />);

    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unpublish' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
  });

  it('unpublishes directly when form is clean (no confirm)', async () => {
    const onUnpublish = vi.fn();
    const user = userEvent.setup();
    render(
      <VideoFormFooter {...defaultPublishedProps} isDirty={false} onUnpublish={onUnpublish} />
    );

    await user.click(screen.getByRole('button', { name: 'Unpublish' }));

    expect(onUnpublish).toHaveBeenCalledOnce();
  });

  it('shows confirm dialog when form is dirty before unpublishing', async () => {
    const onUnpublish = vi.fn();
    const user = userEvent.setup();
    render(<VideoFormFooter {...defaultPublishedProps} isDirty onUnpublish={onUnpublish} />);

    await user.click(screen.getByRole('button', { name: 'Unpublish' }));

    // AlertDialog should be visible (dialog content opened)
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(onUnpublish).not.toHaveBeenCalled();
  });

  it('calls onUnpublish after confirming dirty-state dialog', async () => {
    const onUnpublish = vi.fn();
    const user = userEvent.setup();
    render(<VideoFormFooter {...defaultPublishedProps} isDirty onUnpublish={onUnpublish} />);

    await user.click(screen.getByRole('button', { name: 'Unpublish' }));
    // Find and click the confirm action inside the alert dialog
    await user.click(screen.getByRole('button', { name: 'Unpublish anyway' }));

    expect(onUnpublish).toHaveBeenCalledOnce();
  });
});
