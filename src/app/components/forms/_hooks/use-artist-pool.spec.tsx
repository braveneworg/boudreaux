/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

import { deleteArtistBioImageAction } from '@/lib/actions/delete-artist-bio-image-action';
import { setArtistDisplayImagesAction } from '@/lib/actions/set-artist-display-images-action';
import { queryKeys } from '@/lib/query-keys';
import type { BioGenerationStatusResponse } from '@/lib/validation/bio-generation-schema';

import { useArtistPool } from './use-artist-pool';
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
  HttpError: class HttpError extends Error {},
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
  it('adds an upload to the display images as the set is when the upload lands', async () => {
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
      adding = result.current.add(new File(['x'], 'n.jpg', { type: 'image/jpeg' }), {
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
});
