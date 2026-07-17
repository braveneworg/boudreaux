/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { CLIENT_POLL_DEADLINE_MS } from '@/lib/validation/bio-generation-schema';
import type { VideoFormData } from '@/lib/validation/create-video-schema';
import type { VideoLevelSuggestionField } from '@/lib/validation/video-enrichment-schema';

import { VideoEnrichmentPanel } from './video-enrichment-panel';

const mocks = vi.hoisted(() => ({
  useVideoEnrichmentStatusQuery: vi.fn(),
  runVideoEnrichment: vi.fn(),
  applyVideoSuggestion: vi.fn(),
  applyVideoSuggestionAsync: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/app/hooks/use-video-enrichment-status-query', () => ({
  useVideoEnrichmentStatusQuery: (videoId: string, options: unknown) =>
    mocks.useVideoEnrichmentStatusQuery(videoId, options),
}));

vi.mock('@/app/hooks/mutations/use-video-enrichment-mutations', () => ({
  useRunVideoEnrichmentMutation: () => ({
    runVideoEnrichment: mocks.runVideoEnrichment,
    isRunningVideoEnrichment: false,
  }),
  useApplyVideoSuggestionMutation: () => ({
    applyVideoSuggestion: mocks.applyVideoSuggestion,
    applyVideoSuggestionAsync: mocks.applyVideoSuggestionAsync,
    isApplyingVideoSuggestion: false,
  }),
}));

const baseStatus = {
  status: null,
  error: null,
  progress: null,
  enrichedAt: null,
  currentReleasedOn: '2026-02-01',
  artists: [],
  suggestions: [],
};

const leadArtist = {
  artistId: 'a1',
  displayName: 'E2E Enrich Lead',
  role: 'PRIMARY' as const,
  current: {
    firstName: 'E2E',
    middleName: null,
    surname: 'Enrich Lead',
    akaNames: null,
    displayName: 'E2E Enrich Lead',
    bornOn: null,
  },
};

const bornOnSuggestion = {
  id: 's1',
  artistId: 'a1',
  field: 'bornOn' as const,
  value: '1985-03-15',
  confidence: 'high' as const,
  sources: [{ url: 'https://musicbrainz.org/artist/x' }],
  note: null,
  status: 'pending' as const,
};

const releasedOnSuggestion = {
  id: 's3',
  artistId: null,
  field: 'releasedOn' as const,
  value: '2020-06-01',
  confidence: 'medium' as const,
  sources: [{ url: 'https://musicbrainz.org/release/y' }],
  note: null,
  status: 'pending' as const,
};

const descriptionSuggestion = {
  id: 's4',
  artistId: null,
  field: 'description' as const,
  value: 'A haunting studio performance filmed in one take.',
  confidence: 'low' as const,
  sources: [],
  note: null,
  status: 'pending' as const,
};

const featuredArtistSuggestion = {
  id: 's5',
  artistId: null,
  field: 'featuredArtist' as const,
  value: 'Guest Vocalist',
  confidence: 'medium' as const,
  sources: [{ url: 'https://musicbrainz.org/release/z' }],
  note: null,
  status: 'pending' as const,
};

const succeededStatus = {
  ...baseStatus,
  status: 'succeeded',
  enrichedAt: '2026-07-11T00:00:00.000Z',
  artists: [leadArtist],
  suggestions: [bornOnSuggestion, releasedOnSuggestion],
};

const setStatus = (data: unknown) =>
  mocks.useVideoEnrichmentStatusQuery.mockReturnValue({
    isPending: false,
    error: Error('Unknown error'),
    data,
    refetch: vi.fn(),
  });

interface HarnessProps {
  /** Spy fired alongside the real form write, so tests can assert the args. */
  onApply?: (field: VideoLevelSuggestionField, value: string) => void;
  /** Seed initial artist so featured-apply composes against it. */
  artist?: string;
}

/**
 * Wires `onApplyVideoSuggestion` into the real RHF form exactly like
 * `VideoForm` does (featured appends `feat.`, other fields overwrite), so the
 * panel's live-form applied-state derivation is exercised end to end.
 */
const Harness = ({ onApply = vi.fn(), artist = '' }: HarnessProps) => {
  const form = useForm<VideoFormData>({
    defaultValues: { releasedOn: '2026-02-01', description: '', artist },
  });
  const onApplyVideoSuggestion = (field: VideoLevelSuggestionField, value: string): void => {
    onApply(field, value);
    if (field === 'featuredArtist') {
      const current = form.getValues('artist');
      form.setValue('artist', current ? `${current} feat. ${value}` : value);
      return;
    }
    form.setValue(field, value);
  };
  return (
    <VideoEnrichmentPanel
      videoId="v1"
      control={form.control}
      onApplyVideoSuggestion={onApplyVideoSuggestion}
    />
  );
};

beforeEach(() => {
  setStatus(baseStatus);
  mocks.applyVideoSuggestionAsync.mockResolvedValue({ success: true });
});

describe('VideoEnrichmentPanel — states', () => {
  it('renders a skeleton while the status query has no data', () => {
    setStatus(undefined);
    render(<Harness />);

    expect(screen.getByTestId('video-enrichment-panel')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Run enrichment' })).not.toBeInTheDocument();
  });

  it('offers Run enrichment for a never-enriched video', () => {
    render(<Harness />);

    expect(screen.getByRole('button', { name: 'Run enrichment' })).toBeInTheDocument();
  });

  it('runs enrichment directly (no dialog) from the empty state', async () => {
    render(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: 'Run enrichment' }));

    expect(mocks.runVideoEnrichment).toHaveBeenCalledTimes(1);
  });

  it('shows the in-flight chip while processing', () => {
    setStatus({
      ...baseStatus,
      status: 'processing',
      progress: { stage: 'musicbrainz', at: '2026-07-11T00:00:00.000Z' },
    });
    render(<Harness />);

    expect(screen.getByTestId('video-enrichment-status-chip')).toHaveTextContent('Enriching…');
  });

  it('shows the progress timeline while processing', () => {
    setStatus({
      ...baseStatus,
      status: 'processing',
      progress: { stage: 'musicbrainz', at: '2026-07-11T00:00:00.000Z' },
    });
    render(<Harness />);

    expect(screen.getByRole('list', { name: 'Enrichment progress' })).toBeInTheDocument();
  });

  it('hides the run buttons while in flight', () => {
    setStatus({ ...baseStatus, status: 'pending' });
    render(<Harness />);

    expect(screen.queryByRole('button', { name: /enrichment/i })).not.toBeInTheDocument();
  });

  it('shows the stored error and Re-run on failure', () => {
    setStatus({ ...baseStatus, status: 'failed', error: 'Lambda invoke failed' });
    render(<Harness />);

    expect(screen.getByText('Lambda invoke failed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Re-run enrichment' })).toBeInTheDocument();
  });

  it('announces the failed terminal state politely', () => {
    setStatus({ ...baseStatus, status: 'failed', error: 'Lambda invoke failed' });
    render(<Harness />);

    expect(screen.getByText('Enrichment failed.')).toHaveClass('sr-only');
  });

  it('announces the succeeded terminal state politely', () => {
    setStatus(succeededStatus);
    render(<Harness />);

    expect(screen.getByText('Enrichment succeeded.')).toHaveClass('sr-only');
  });

  it('renders one card per artist with suggestions on success', () => {
    setStatus(succeededStatus);
    render(<Harness />);

    expect(screen.getAllByTestId('video-artist-suggestion-card')).toHaveLength(1);
  });

  it('renders the release-date suggestion on success', () => {
    setStatus(succeededStatus);
    render(<Harness />);

    expect(screen.getByTestId('video-release-date-suggestion')).toBeInTheDocument();
  });

  it('omits artists that have no suggestions', () => {
    setStatus({ ...succeededStatus, suggestions: [releasedOnSuggestion] });
    render(<Harness />);

    expect(screen.queryByTestId('video-artist-suggestion-card')).not.toBeInTheDocument();
  });
});

describe('VideoEnrichmentPanel — re-run dialog', () => {
  it('opens a confirm dialog instead of re-running immediately', async () => {
    setStatus(succeededStatus);
    render(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: 'Re-run enrichment' }));

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(mocks.runVideoEnrichment).not.toHaveBeenCalled();
  });

  it('re-runs after the dialog is confirmed', async () => {
    setStatus(succeededStatus);
    render(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: 'Re-run enrichment' }));
    await userEvent.click(screen.getByRole('button', { name: 'Re-run' }));

    expect(mocks.runVideoEnrichment).toHaveBeenCalledTimes(1);
  });

  it('does not re-run when the dialog is cancelled', async () => {
    setStatus(succeededStatus);
    render(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: 'Re-run enrichment' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mocks.runVideoEnrichment).not.toHaveBeenCalled();
  });
});

describe('VideoEnrichmentPanel — apply wiring', () => {
  it('sends an apply with the suggestion id and expectedCurrent', async () => {
    setStatus(succeededStatus);
    render(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: 'Apply Born on suggestion' }));

    await waitFor(() =>
      expect(mocks.applyVideoSuggestionAsync).toHaveBeenCalledWith({
        suggestionId: 's1',
        op: 'apply',
        expectedCurrent: null,
      })
    );
  });

  it('sends a dismiss without touching the form', async () => {
    setStatus(succeededStatus);
    render(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss Born on suggestion' }));

    expect(mocks.applyVideoSuggestion).toHaveBeenCalledWith({
      suggestionId: 's1',
      op: 'dismiss',
    });
  });

  it('routes the release-date apply into the form callback, never the server', async () => {
    const onApply = vi.fn();
    setStatus(succeededStatus);
    render(<Harness onApply={onApply} />);

    await userEvent.click(screen.getByRole('button', { name: 'Apply Release date suggestion' }));

    expect(onApply).toHaveBeenCalledWith('releasedOn', '2020-06-01');
    expect(mocks.applyVideoSuggestionAsync).not.toHaveBeenCalled();
  });

  it('dismisses the release-date suggestion server-side', async () => {
    setStatus(succeededStatus);
    render(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss Release date suggestion' }));

    expect(mocks.applyVideoSuggestion).toHaveBeenCalledWith({
      suggestionId: 's3',
      op: 'dismiss',
    });
  });

  it('routes the description apply into the form callback, never the server', async () => {
    const onApply = vi.fn();
    setStatus({ ...succeededStatus, suggestions: [descriptionSuggestion] });
    render(<Harness onApply={onApply} />);

    await userEvent.click(screen.getByRole('button', { name: 'Apply Description suggestion' }));

    expect(onApply).toHaveBeenCalledWith('description', descriptionSuggestion.value);
    expect(mocks.applyVideoSuggestionAsync).not.toHaveBeenCalled();
  });

  it('marks the description card applied once the form holds the value', async () => {
    setStatus({ ...succeededStatus, suggestions: [descriptionSuggestion] });
    render(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: 'Apply Description suggestion' }));

    const card = screen.getByTestId('video-description-suggestion');
    expect(within(card).getByText('Applied')).toBeInTheDocument();
  });

  it('routes the featured-artist apply into the form callback, never the server', async () => {
    const onApply = vi.fn();
    setStatus({ ...succeededStatus, suggestions: [featuredArtistSuggestion] });
    render(<Harness onApply={onApply} artist="Lead Act" />);

    await userEvent.click(screen.getByRole('button', { name: 'Apply Featured artist suggestion' }));

    expect(onApply).toHaveBeenCalledWith('featuredArtist', 'Guest Vocalist');
    expect(mocks.applyVideoSuggestionAsync).not.toHaveBeenCalled();
  });

  it('marks the featured-artist card applied once the name joins the artist string', async () => {
    setStatus({ ...succeededStatus, suggestions: [featuredArtistSuggestion] });
    render(<Harness artist="Lead Act" />);

    await userEvent.click(screen.getByRole('button', { name: 'Apply Featured artist suggestion' }));

    const card = screen.getByTestId('video-featured-artist-suggestion');
    expect(within(card).getByText('Applied')).toBeInTheDocument();
  });

  it('renders one featured-artist card per featuredArtist suggestion row', () => {
    setStatus({
      ...succeededStatus,
      suggestions: [featuredArtistSuggestion, { ...featuredArtistSuggestion, id: 's6' }],
    });
    render(<Harness />);

    expect(screen.getAllByTestId('video-featured-artist-suggestion')).toHaveLength(2);
  });

  it('stops Apply-all after the first apply when the server rejects', async () => {
    mocks.applyVideoSuggestionAsync.mockRejectedValue(new Error('server down'));
    setStatus({
      ...succeededStatus,
      suggestions: [bornOnSuggestion, { ...bornOnSuggestion, id: 's2', field: 'surname' }],
    });
    render(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: 'Apply all' }));

    await waitFor(() => expect(mocks.applyVideoSuggestionAsync).toHaveBeenCalledTimes(1));
  });
});

describe('VideoEnrichmentPanel — poll deadline give-up', () => {
  it('toasts and disables polling when an in-flight job outlives the deadline', () => {
    vi.useFakeTimers();
    setStatus({ ...baseStatus, status: 'processing' });
    render(<Harness />);

    act(() => {
      vi.advanceTimersByTime(CLIENT_POLL_DEADLINE_MS);
    });

    expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
      'Enrichment timed out. Re-run to try again.'
    );
    const lastCall = mocks.useVideoEnrichmentStatusQuery.mock.calls.at(-1);
    expect((lastCall?.[1] as { enabled: boolean }).enabled).toBe(false);
    vi.useRealTimers();
  });

  it('keeps polling enabled before the deadline', () => {
    setStatus({ ...baseStatus, status: 'processing' });
    render(<Harness />);

    const lastCall = mocks.useVideoEnrichmentStatusQuery.mock.calls.at(-1);
    expect((lastCall?.[1] as { enabled: boolean }).enabled).toBe(true);
  });
});
