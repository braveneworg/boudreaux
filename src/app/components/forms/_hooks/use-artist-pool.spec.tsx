/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { toast } from 'sonner';

import { createArtistBioLinkAction } from '@/lib/actions/create-artist-bio-link-action';
import { deleteArtistBioImageAction } from '@/lib/actions/delete-artist-bio-image-action';
import { deleteArtistBioLinkAction } from '@/lib/actions/delete-artist-bio-link-action';
import { setArtistDisplayImagesAction } from '@/lib/actions/set-artist-display-images-action';
import { updateArtistBioImageAltAction } from '@/lib/actions/update-artist-bio-image-alt-action';
import { updateArtistBioImageAttributionAction } from '@/lib/actions/update-artist-bio-image-attribution-action';
import { queryKeys } from '@/lib/query-keys';
import type { BioGenerationStatusResponse } from '@/lib/validation/bio-generation-schema';
import { fetchAndParse, HttpError } from '@/utils/fetch-and-parse';

import { applyDisplayImagesToStatus, useArtistPool } from './use-artist-pool';
import { uploadBioImage, type UploadBioImageResult } from '../utils/upload-bio-image';

vi.mock('../utils/upload-bio-image', () => ({ uploadBioImage: vi.fn() }));
vi.mock('@/lib/actions/set-artist-display-images-action', () => ({
  setArtistDisplayImagesAction: vi.fn(),
}));
vi.mock('@/lib/actions/delete-artist-bio-image-action', () => ({
  deleteArtistBioImageAction: vi.fn(),
}));
vi.mock('@/lib/actions/delete-artist-bio-link-action', () => ({
  deleteArtistBioLinkAction: vi.fn(),
}));
vi.mock('@/lib/actions/create-artist-bio-link-action', () => ({
  createArtistBioLinkAction: vi.fn(),
}));
vi.mock('@/lib/actions/update-artist-bio-image-alt-action', () => ({
  updateArtistBioImageAltAction: vi.fn(),
}));
vi.mock('@/lib/actions/update-artist-bio-image-attribution-action', () => ({
  updateArtistBioImageAttributionAction: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

const ARTIST_ID = 'artist-1';

const image = (id: string, displayOrder: number | null = null) => ({
  id,
  url: `https://cdn.example.com/${id}.jpg`,
  alt: `Alt ${id}`,
  isPrimary: false,
  origin: 'custom' as const,
  displayOrder,
  title: null,
  attribution: null,
  thumbnailUrl: null,
  width: null,
  height: null,
  kind: null,
});

/** What the status endpoint would return now; tests mutate it to play the server. */
let serverStatus: BioGenerationStatusResponse;

const seededContent = (): NonNullable<BioGenerationStatusResponse['content']> => {
  if (!serverStatus.content) throw new Error('the status is seeded with content');
  return serverStatus.content;
};

vi.mock('@/utils/fetch-and-parse', () => ({
  fetchAndParse: vi.fn(async () => serverStatus),
  // Carries the status like the real class: the pool phrases a 429 differently.
  HttpError: class HttpError extends Error {
    constructor(
      message: string,
      readonly status: number
    ) {
      super(message);
    }
  },
}));

const renderPool = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'QueryClientTestWrapper';
  return { client, ...renderHook(() => useArtistPool(ARTIST_ID), { wrapper: Wrapper }) };
};

beforeEach(() => {
  serverStatus = {
    status: 'succeeded',
    error: null,
    progress: null,
    content: {
      shortBio: '',
      longBio: '',
      altBio: '',
      genres: null,
      model: 'fake',
      links: [],
      images: [image('a', 0), image('x'), image('y')],
    },
  } as unknown as BioGenerationStatusResponse;
  // The server applies a set write: the chosen ids take their index.
  vi.mocked(setArtistDisplayImagesAction).mockImplementation(async ({ imageIds }) => {
    const content = seededContent();
    serverStatus = {
      ...serverStatus,
      content: {
        ...content,
        images: content.images.map((row) => ({
          ...row,
          displayOrder: imageIds.indexOf(row.id) === -1 ? null : imageIds.indexOf(row.id),
        })),
      },
    };
    return { success: true, data: undefined } as never;
  });
});

describe('useArtistPool', () => {
  it('reads the pool and the chosen set from the status query', async () => {
    const { result } = renderPool();

    await waitFor(() => expect(result.current.images).toHaveLength(3));
    expect(result.current.chosenIds).toEqual(['a']);
    expect(result.current.shown.tier).toBe('chosen');
  });

  // The defect this guards: the old manager decided "join the set if there is
  // room" against the chosen ids captured when the upload STARTED, so a choice
  // made during the upload was overwritten when it landed.
  it('adds a manager upload to the display images as the set is when the upload lands', async () => {
    let finishUpload!: (value: UploadBioImageResult) => void;
    vi.mocked(uploadBioImage).mockReturnValueOnce(
      new Promise((resolve) => {
        finishUpload = resolve;
      })
    );
    const { result } = renderPool();
    await waitFor(() => expect(result.current.images).toHaveLength(3));

    let adding!: Promise<unknown>;
    act(() => {
      adding = result.current.addAsDisplayImage(new File(['x'], 'n.jpg', { type: 'image/jpeg' }), {
        alt: null,
        attribution: '',
      });
    });
    expect(result.current.isAdding).toBe(true);
    expect(result.current.isMutating).toBe(true);

    // The admin chooses X while the upload is still in flight.
    await act(async () => {
      result.current.choose('x');
    });
    await waitFor(() => expect(result.current.chosenIds).toEqual(['a', 'x']));

    const content = seededContent();
    serverStatus = {
      ...serverStatus,
      content: { ...content, images: [...content.images, image('n')] },
    } as BioGenerationStatusResponse;
    await act(async () => {
      finishUpload({
        success: true,
        data: { id: 'n', url: 'https://cdn.example.com/n.jpg' } as never,
      });
      await adding;
    });

    await waitFor(() =>
      expect(vi.mocked(setArtistDisplayImagesAction).mock.calls.at(-1)?.[0]).toEqual({
        artistId: ARTIST_ID,
        imageIds: ['a', 'x', 'n'],
      })
    );
    expect(result.current.isAdding).toBe(false);
  });

  it('invalidates both pool keys after a pool write', async () => {
    vi.mocked(deleteArtistBioImageAction).mockResolvedValueOnce({ success: true } as never);
    const { client, result } = renderPool();
    await waitFor(() => expect(result.current.images).toHaveLength(3));
    client.setQueryData(queryKeys.artists.bioImages(ARTIST_ID), []);
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    await act(async () => {
      result.current.remove('y');
    });

    await waitFor(() => expect(invalidate).toHaveBeenCalled());
    const keys = invalidate.mock.calls.map(([options]) => JSON.stringify(options?.queryKey));
    expect(keys).toContain(JSON.stringify(queryKeys.artists.bioGeneration(ARTIST_ID)));
    expect(keys).toContain(JSON.stringify(queryKeys.artists.bioImages(ARTIST_ID)));
  });

  // ── uploads ───────────────────────────────────────────────────────────────

  it('refuses a non-image file before the pipeline and says why', async () => {
    const { result } = renderPool();
    await waitFor(() => expect(result.current.images).toHaveLength(3));

    let record: unknown;
    await act(async () => {
      record = await result.current.add(new File(['x'], 'notes.txt', { type: 'text/plain' }), {
        alt: null,
        attribution: '',
      });
    });

    expect(record).toBeNull();
    expect(uploadBioImage).not.toHaveBeenCalled();
    expect(result.current.addError).toMatch(/JPEG, PNG, or WebP/);
  });

  it('keeps the pipeline’s own failure copy, or a generic one when it gives none', async () => {
    vi.mocked(uploadBioImage)
      .mockResolvedValueOnce({ success: false, error: 'S3 refused' })
      .mockResolvedValueOnce({ success: false });
    const { result } = renderPool();
    await waitFor(() => expect(result.current.images).toHaveLength(3));
    const jpeg = new File(['x'], 'p.jpg', { type: 'image/jpeg' });

    await act(async () => {
      await result.current.add(jpeg, { alt: null, attribution: '' });
    });
    expect(result.current.addError).toBe('S3 refused');

    await act(async () => {
      await result.current.add(jpeg, { alt: null, attribution: '' });
    });
    expect(result.current.addError).toBe('Failed to upload image');
  });

  it('appends a manager upload past three — the chosen set has no cap', async () => {
    const content = seededContent();
    serverStatus = {
      ...serverStatus,
      content: { ...content, images: [image('a', 0), image('x', 1), image('y', 2)] },
    };
    vi.mocked(uploadBioImage).mockResolvedValueOnce({
      success: true,
      data: { id: 'n', url: 'https://cdn.example.com/n.jpg' } as never,
    });
    const { result } = renderPool();
    await waitFor(() => expect(result.current.chosenIds).toEqual(['a', 'x', 'y']));

    await act(async () => {
      await result.current.addAsDisplayImage(new File(['x'], 'p.jpg', { type: 'image/jpeg' }), {
        alt: null,
        attribution: '',
      });
    });

    expect(setArtistDisplayImagesAction).toHaveBeenCalledWith({
      artistId: ARTIST_ID,
      imageIds: ['a', 'x', 'y', 'n'],
    });
  });

  // The bio editor's inline upload exists to place an image in the prose; it
  // stays in the pool and never touches the chosen set (ADR-0008, addendum 2).
  it('keeps a bio-editor upload (add) out of the chosen set and refreshes the picker pool', async () => {
    vi.mocked(uploadBioImage).mockResolvedValueOnce({
      success: true,
      data: { id: 'n', url: 'https://cdn.example.com/n.jpg' } as never,
    });
    const { client, result } = renderPool();
    await waitFor(() => expect(result.current.chosenIds).toEqual(['a']));
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    await act(async () => {
      await result.current.add(new File(['x'], 'p.jpg', { type: 'image/jpeg' }), {
        alt: null,
        attribution: '',
      });
    });

    expect(setArtistDisplayImagesAction).not.toHaveBeenCalled();
    const keys = invalidate.mock.calls.map(([options]) => JSON.stringify(options?.queryKey));
    expect(keys).toContain(JSON.stringify(queryKeys.artists.bioImages(ARTIST_ID)));
  });

  // ── the display-set write ─────────────────────────────────────────────────

  it('rolls the optimistic choice back and toasts when the set action refuses', async () => {
    vi.mocked(setArtistDisplayImagesAction).mockResolvedValueOnce({
      success: false,
      error: 'Alt text required',
    } as never);
    const { result } = renderPool();
    await waitFor(() => expect(result.current.images).toHaveLength(3));

    await act(async () => {
      result.current.choose('x');
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Alt text required'));
    await waitFor(() => expect(result.current.chosenIds).toEqual(['a']));
  });

  it('toasts the generic copy when the set action refuses without a reason, or throws', async () => {
    vi.mocked(setArtistDisplayImagesAction)
      .mockResolvedValueOnce({ success: false } as never)
      .mockRejectedValueOnce(new Error('network'));
    const { result } = renderPool();
    await waitFor(() => expect(result.current.images).toHaveLength(3));

    await act(async () => {
      result.current.choose('x');
    });
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Failed to update display images')
    );

    await act(async () => {
      result.current.unchoose('a');
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(2));
  });

  it('writes the whole set on reorder and unchoose', async () => {
    const { result } = renderPool();
    await waitFor(() => expect(result.current.images).toHaveLength(3));

    await act(async () => {
      result.current.setDisplayImages(['x', 'a']);
    });
    await waitFor(() =>
      expect(setArtistDisplayImagesAction).toHaveBeenLastCalledWith({
        artistId: ARTIST_ID,
        imageIds: ['x', 'a'],
      })
    );

    await act(async () => {
      result.current.unchoose('x');
    });
    await waitFor(() =>
      expect(setArtistDisplayImagesAction).toHaveBeenLastCalledWith({
        artistId: ARTIST_ID,
        imageIds: ['a'],
      })
    );
  });

  // ── the other writes ──────────────────────────────────────────────────────

  it('runs alt, attribution and link writes through their actions', async () => {
    vi.mocked(updateArtistBioImageAltAction).mockResolvedValueOnce({ success: true } as never);
    vi.mocked(updateArtistBioImageAttributionAction).mockResolvedValueOnce({
      success: true,
    } as never);
    vi.mocked(deleteArtistBioLinkAction).mockResolvedValueOnce({ success: true } as never);
    const { result } = renderPool();
    await waitFor(() => expect(result.current.images).toHaveLength(3));

    await act(async () => {
      result.current.setAlt('x', 'Alt');
      result.current.setAttribution('x', 'Credit');
      result.current.removeLink('l1');
    });

    await waitFor(() =>
      expect(updateArtistBioImageAltAction).toHaveBeenCalledWith({ imageId: 'x', alt: 'Alt' })
    );
    expect(updateArtistBioImageAttributionAction).toHaveBeenCalledWith({
      imageId: 'x',
      attribution: 'Credit',
    });
    expect(deleteArtistBioLinkAction).toHaveBeenCalledWith('l1');
  });

  it('toasts a refused pool write with its reason, or the write’s own copy without one', async () => {
    vi.mocked(deleteArtistBioImageAction)
      .mockResolvedValueOnce({ success: false, error: 'Still a display image' } as never)
      .mockResolvedValueOnce({ success: false } as never);
    const { result } = renderPool();
    await waitFor(() => expect(result.current.images).toHaveLength(3));

    await act(async () => {
      result.current.remove('y');
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Still a display image'));

    await act(async () => {
      result.current.remove('y');
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to delete bio image'));
  });

  it('resolves the created link row, or null with a toast when the create is refused', async () => {
    vi.mocked(createArtistBioLinkAction)
      .mockResolvedValueOnce({ success: true, data: { id: 'l-new' } } as never)
      .mockResolvedValueOnce({ success: false, error: 'Duplicate' } as never)
      .mockResolvedValueOnce({ success: false } as never);
    const { result } = renderPool();
    await waitFor(() => expect(result.current.images).toHaveLength(3));
    const input = { artistId: ARTIST_ID, label: 'Site', url: 'https://example.com' };

    let created: unknown;
    await act(async () => {
      created = await result.current.addLink(input);
    });
    expect(created).toEqual({ id: 'l-new' });

    await act(async () => {
      created = await result.current.addLink(input);
    });
    expect(created).toBeNull();
    expect(toast.error).toHaveBeenCalledWith('Duplicate');

    await act(async () => {
      created = await result.current.addLink(input);
    });
    expect(toast.error).toHaveBeenCalledWith('Failed to add bio link');
  });

  // ── the read ──────────────────────────────────────────────────────────────

  it('phrases a throttled read as rate limiting and any other failure by its message', async () => {
    vi.mocked(fetchAndParse)
      .mockRejectedValueOnce(new HttpError('Failed to fetch bio generation status', 429))
      .mockRejectedValueOnce(new HttpError('Failed to fetch bio generation status', 500));

    const first = renderPool();
    await waitFor(() =>
      expect(first.result.current.loadError).toBe(
        'the server is rate limiting requests, try again in a moment'
      )
    );

    const second = renderPool();
    await waitFor(() =>
      expect(second.result.current.loadError).toBe('Failed to fetch bio generation status')
    );
    expect(second.result.current.images).toEqual([]);
    expect(second.result.current.links).toEqual([]);
  });

  it('is pending with no load error before the first read resolves', () => {
    vi.mocked(fetchAndParse).mockReturnValueOnce(new Promise(() => {}));
    const { result } = renderPool();

    expect(result.current.isPending).toBe(true);
    expect(result.current.loadError).toBeNull();
  });

  it('re-reads the pool on retry', async () => {
    const { result } = renderPool();
    await waitFor(() => expect(result.current.images).toHaveLength(3));
    const calls = vi.mocked(fetchAndParse).mock.calls.length;

    await act(async () => {
      result.current.retry();
    });

    await waitFor(() => expect(vi.mocked(fetchAndParse).mock.calls.length).toBe(calls + 1));
  });
});

describe('applyDisplayImagesToStatus', () => {
  const status = (images: ReturnType<typeof image>[]): BioGenerationStatusResponse =>
    ({
      status: 'succeeded',
      error: null,
      progress: null,
      content: {
        shortBio: '',
        longBio: '',
        altBio: '',
        genres: null,
        model: 'fake',
        links: [],
        images,
      },
    }) as unknown as BioGenerationStatusResponse;

  it('returns a status without content as is', () => {
    const empty = { status: null, error: null, progress: null, content: null } as never;
    expect(applyDisplayImagesToStatus(empty, ['a'])).toBe(empty);
  });

  it('gives each chosen image its position as custom and clears the rest', () => {
    const next = applyDisplayImagesToStatus(status([image('a', 0), image('x'), image('y', 2)]), [
      'y',
      'x',
    ]);

    expect(
      next.content?.images.map(({ id, displayOrder, origin }) => [id, displayOrder, origin])
    ).toEqual([
      ['a', null, 'custom'],
      ['x', 1, 'custom'],
      ['y', 0, 'custom'],
    ]);
  });

  it('clears a row that has no id', () => {
    const row = { ...image('a', 0), id: undefined } as never;
    const next = applyDisplayImagesToStatus(status([row]), ['a']);

    expect(next.content?.images[0]?.displayOrder).toBeNull();
  });
});
