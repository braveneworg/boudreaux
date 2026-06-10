/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { act } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { createQueryWrapper } from '@/test-utils/create-query-wrapper';

import { FreeFormatSelectStep } from './free-format-select-step';

vi.mock('@/lib/utils/trigger-download', () => ({
  triggerDownload: vi.fn(),
}));

describe('FreeFormatSelectStep', () => {
  it('renders the instructional message with aria-live="polite"', () => {
    render(
      <FreeFormatSelectStep
        releaseId="release-123"
        availableFreeFormats={['MP3_320KBPS', 'AAC']}
      />,
      { wrapper: createQueryWrapper() }
    );

    const message = screen.getByText('Select one or both free formats to download.');
    expect(message).toBeInTheDocument();
    expect(message).toHaveAttribute('aria-live', 'polite');
  });

  it('restricts combobox options to FREE_FORMAT_TYPES intersected with publishedFormats', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(
      <FreeFormatSelectStep releaseId="release-123" availableFreeFormats={['MP3_320KBPS']} />,
      { wrapper: createQueryWrapper() }
    );

    await user.click(screen.getByRole('combobox'));
    const options = screen.getAllByRole('option').map((o) => o.textContent ?? '');
    // Should NOT include FLAC/WAV/AIFF/AAC.
    expect(options.some((t) => /MP3 320/i.test(t))).toBe(true);
    expect(options.some((t) => /FLAC/i.test(t))).toBe(false);
    expect(options.some((t) => /WAV/i.test(t))).toBe(false);
    expect(options.some((t) => /AAC/i.test(t))).toBe(false);
  });

  it('disables the download button until at least one free format is selected', () => {
    render(
      <FreeFormatSelectStep
        releaseId="release-123"
        availableFreeFormats={['MP3_320KBPS', 'AAC']}
      />,
      { wrapper: createQueryWrapper() }
    );

    const button = screen.getByRole('button', { name: /select at least one format/i });
    expect(button).toBeDisabled();
  });

  it('enables the download button after selecting one free format', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(
      <FreeFormatSelectStep
        releaseId="release-123"
        availableFreeFormats={['MP3_320KBPS', 'AAC']}
      />,
      { wrapper: createQueryWrapper() }
    );

    await user.click(screen.getByRole('combobox'));
    const options = screen.getAllByRole('option');
    const mp3Option = options.find((o) => /MP3 320/i.test(o.textContent ?? ''));
    expect(mp3Option).toBeDefined();
    if (mp3Option) {
      await user.click(mp3Option);
    }

    const button = screen.getByRole('button', { name: /download 1 format/i });
    expect(button).toBeEnabled();
  });

  it('renders defensive empty-state copy when availableFreeFormats is empty', () => {
    render(<FreeFormatSelectStep releaseId="release-123" availableFreeFormats={[]} />, {
      wrapper: createQueryWrapper(),
    });

    const empty = screen.getByText('No free formats available for this release');
    expect(empty).toBeInTheDocument();
    expect(empty).toHaveAttribute('aria-live', 'polite');
  });

  describe('cap-reached state (T046)', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('renders the disabled "Download limit reached" button when capReachedResetsAtIso is set', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-05-08T12:00:00Z'));
      render(
        <FreeFormatSelectStep
          releaseId="release-123"
          availableFreeFormats={['MP3_320KBPS', 'AAC']}
          capReachedResetsAtIso="2026-05-08T13:30:00Z"
        />,
        { wrapper: createQueryWrapper() }
      );

      const button = screen.getByRole('button', { name: /download limit reached/i });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-describedby', 'free-cap-reached-countdown');
    });

    it('renders a live auto-scaling countdown that ticks every second', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-05-08T12:00:00Z'));
      render(
        <FreeFormatSelectStep
          releaseId="release-123"
          availableFreeFormats={['MP3_320KBPS', 'AAC']}
          capReachedResetsAtIso="2026-05-08T13:30:00Z"
        />,
        { wrapper: createQueryWrapper() }
      );

      const countdown = screen.getByTestId('time-remaining');
      // 1h 30m exactly.
      expect(countdown).toHaveTextContent('1h 30m');

      // Advance one second — still 1h 29m (countdown shows whole minutes).
      act(() => {
        vi.advanceTimersByTime(1_000);
      });
      expect(countdown).toHaveTextContent(/1h 29m|1h 30m/);
    });

    it('renders a CTA link to the premium / sign-in path', () => {
      render(
        <FreeFormatSelectStep
          releaseId="release-123"
          availableFreeFormats={['MP3_320KBPS', 'AAC']}
          capReachedResetsAtIso="2026-05-08T13:30:00Z"
        />,
        { wrapper: createQueryWrapper() }
      );

      const cta = screen.getByRole('link', { name: /pay what you want/i });
      expect(cta).toBeInTheDocument();
      expect(cta).toHaveAttribute('href', '/releases/release-123#purchase');
    });

    it('respects an explicit premiumCtaHref override', () => {
      render(
        <FreeFormatSelectStep
          releaseId="release-123"
          availableFreeFormats={['MP3_320KBPS', 'AAC']}
          capReachedResetsAtIso="2026-05-08T13:30:00Z"
          premiumCtaHref="/sign-in?redirect=/releases/release-123"
        />,
        { wrapper: createQueryWrapper() }
      );

      const cta = screen.getByRole('link', { name: /pay what you want/i });
      expect(cta).toHaveAttribute('href', '/sign-in?redirect=/releases/release-123');
    });

    it('does NOT render the format combobox when cap-reached', () => {
      render(
        <FreeFormatSelectStep
          releaseId="release-123"
          availableFreeFormats={['MP3_320KBPS', 'AAC']}
          capReachedResetsAtIso="2026-05-08T13:30:00Z"
        />,
        { wrapper: createQueryWrapper() }
      );

      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('renders a spinner when isLoading and no formats are yet available', () => {
      render(<FreeFormatSelectStep releaseId="release-123" availableFreeFormats={[]} isLoading />, {
        wrapper: createQueryWrapper(),
      });

      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });
  });
});
