/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom
import type { ChangeEvent, DragEvent } from 'react';

import { act, renderHook, waitFor } from '@testing-library/react';

import type { FinalizeCoverArtUploadResult } from '@/lib/actions/finalize-cover-art-upload-action';
import type { GenerateImageVariantsResult } from '@/lib/actions/generate-image-variants-action';
import type { PresignedUrlActionResult } from '@/lib/actions/presigned-upload-actions';
import type { DirectUploadResult } from '@/lib/utils/direct-upload';

import { useCoverArtUpload, VALID_IMAGE_TYPES } from './use-cover-art-upload';

import type { FieldPath, FieldValues, UseFormSetValue } from 'react-hook-form';

const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }));

const finalizeCoverArtUploadAction = vi.hoisted(() => vi.fn());
vi.mock('@/lib/actions/finalize-cover-art-upload-action', () => ({
  finalizeCoverArtUploadAction,
}));

const generateImageVariantsAction = vi.hoisted(() => vi.fn());
vi.mock('@/lib/actions/generate-image-variants-action', () => ({
  generateImageVariantsAction,
}));

const getPresignedUploadUrlsAction = vi.hoisted(() => vi.fn());
vi.mock('@/lib/actions/presigned-upload-actions', () => ({
  getPresignedUploadUrlsAction,
}));

const uploadFileToS3 = vi.hoisted(() => vi.fn());
vi.mock('@/lib/utils/direct-upload', () => ({ uploadFileToS3 }));

// ---------------------------------------------------------------------------
// Typed fixtures + harness
// ---------------------------------------------------------------------------

interface CoverArtForm extends FieldValues {
  coverArt: string;
}

type CoverArtFieldName = FieldPath<CoverArtForm>;

const CDN_URL = 'https://cdn.example.com/media/artists/abc/cover.png';
const S3_KEY = 'media/artists/abc/cover.png';

const presignedSuccess = (): PresignedUrlActionResult => ({
  success: true,
  data: [{ uploadUrl: 'https://s3.example.com/put', s3Key: S3_KEY, cdnUrl: CDN_URL }],
});

const presignedFailure = (error?: string): PresignedUrlActionResult => ({
  success: false,
  ...(error === undefined ? {} : { error }),
});

const directUploadSuccess = (cdnUrl: string = CDN_URL): DirectUploadResult => ({
  success: true,
  s3Key: S3_KEY,
  cdnUrl,
});

const directUploadFailure = (error?: string): DirectUploadResult => ({
  success: false,
  s3Key: S3_KEY,
  cdnUrl: CDN_URL,
  ...(error === undefined ? {} : { error }),
});

const variantsResult = (
  overrides: Partial<GenerateImageVariantsResult> = {}
): GenerateImageVariantsResult => ({
  success: true,
  variantsGenerated: 3,
  ...overrides,
});

const finalizeResult = (
  overrides: Partial<FinalizeCoverArtUploadResult> = {}
): FinalizeCoverArtUploadResult => ({
  success: true,
  deletedKeys: [],
  ...overrides,
});

const makeFile = (name = 'cover.png', type = 'image/png', size = 1024): File => {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

interface HarnessOptions {
  entityId?: string;
  onUploadComplete?: (cdnUrl: string) => Promise<void>;
  ref?: { current: HTMLInputElement | null };
}

interface HarnessResult {
  setValue: UseFormSetValue<CoverArtForm>;
  name: CoverArtFieldName;
}

const renderUpload = ({ entityId, onUploadComplete, ref }: HarnessOptions = {}) => {
  const setValue: UseFormSetValue<CoverArtForm> = vi.fn();
  const name: CoverArtFieldName = 'coverArt';
  const rendered = renderHook(() =>
    useCoverArtUpload<CoverArtForm, CoverArtFieldName>({
      name,
      setValue,
      entityType: 'artists',
      ...(entityId === undefined ? {} : { entityId }),
      ...(onUploadComplete === undefined ? {} : { onUploadComplete }),
    })
  );
  if (ref) rendered.result.current.fileInputRef.current = ref.current;
  const harness: HarnessResult = { setValue, name };
  return { ...rendered, harness };
};

interface FileSelectEventOptions {
  file?: File;
}

const fileSelectEvent = ({ file }: FileSelectEventOptions): ChangeEvent<HTMLInputElement> => {
  const target = { files: file ? [file] : [] } as unknown as HTMLInputElement;
  return { target } as ChangeEvent<HTMLInputElement>;
};

interface DropEventOptions {
  file?: File;
  preventDefault: () => void;
}

const dropEvent = ({ file, preventDefault }: DropEventOptions): DragEvent<HTMLDivElement> =>
  ({
    preventDefault,
    dataTransfer: { files: file ? [file] : [] },
  }) as unknown as DragEvent<HTMLDivElement>;

const dragEvent = (preventDefault: () => void): DragEvent<HTMLDivElement> =>
  ({ preventDefault }) as unknown as DragEvent<HTMLDivElement>;

const BLOB_URL = 'blob:cover-art-preview';

const createObjectURL = vi.fn(() => BLOB_URL);
const revokeObjectURL = vi.fn();
const randomUUID = vi.fn(
  (): `${string}-${string}-${string}-${string}-${string}` => '11111111-1111-1111-1111-111111111111'
);
let consoleWarn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  globalThis.URL.createObjectURL = createObjectURL;
  globalThis.URL.revokeObjectURL = revokeObjectURL;
  globalThis.crypto.randomUUID = randomUUID;

  consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

  getPresignedUploadUrlsAction.mockResolvedValue(presignedSuccess());
  uploadFileToS3.mockResolvedValue(directUploadSuccess());
  generateImageVariantsAction.mockResolvedValue(variantsResult());
  finalizeCoverArtUploadAction.mockResolvedValue(finalizeResult());
});

afterEach(() => {
  consoleWarn.mockRestore();
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

describe('VALID_IMAGE_TYPES', () => {
  it('contains the four supported image MIME types', () => {
    expect(VALID_IMAGE_TYPES).toEqual(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
  });
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('useCoverArtUpload initial state', () => {
  it('starts with isUploading false', () => {
    const { result } = renderUpload();

    expect(result.current.isUploading).toBe(false);
  });

  it('starts with an empty local preview url', () => {
    const { result } = renderUpload();

    expect(result.current.localPreviewUrl).toBe('');
  });

  it('starts with isDragOver false', () => {
    const { result } = renderUpload();

    expect(result.current.isDragOver).toBe(false);
  });

  it('exposes a file input ref initialised to null', () => {
    const { result } = renderUpload();

    expect(result.current.fileInputRef.current).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Validation guards (validateFile)
// ---------------------------------------------------------------------------

describe('useCoverArtUpload file validation', () => {
  it('rejects a file whose type is not in VALID_IMAGE_TYPES', async () => {
    const { result } = renderUpload();

    await act(async () => {
      result.current.handleFileSelect(
        fileSelectEvent({ file: makeFile('doc.pdf', 'application/pdf') })
      );
    });

    expect(toastError).toHaveBeenCalledWith(
      'Please select a valid image file (JPEG, PNG, WebP, or GIF)'
    );
  });

  it('does not request presigned urls for an invalid file type', async () => {
    const { result } = renderUpload();

    await act(async () => {
      result.current.handleFileSelect(
        fileSelectEvent({ file: makeFile('doc.pdf', 'application/pdf') })
      );
    });

    expect(getPresignedUploadUrlsAction).not.toHaveBeenCalled();
  });

  it('rejects a file larger than 50MB', async () => {
    const oversized = makeFile('big.png', 'image/png', 50 * 1024 * 1024 + 1);
    const { result } = renderUpload();

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: oversized }));
    });

    expect(toastError).toHaveBeenCalledWith('Image must be less than 50MB');
  });

  it('accepts a file exactly at the 50MB boundary', async () => {
    const atLimit = makeFile('limit.png', 'image/png', 50 * 1024 * 1024);
    const { result } = renderUpload();

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: atLimit }));
    });

    expect(getPresignedUploadUrlsAction).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Happy path — with entityId + onUploadComplete (stable key + variants + finalize)
// ---------------------------------------------------------------------------

describe('useCoverArtUpload happy path with stable key and callback', () => {
  it('sets a local preview from the selected file', async () => {
    const onUploadComplete = vi.fn(async () => {});
    const { result } = renderUpload({ entityId: 'abc', onUploadComplete });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });

    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('requests presigned urls with the stable existing s3 key', async () => {
    const onUploadComplete = vi.fn(async () => {});
    const { result } = renderUpload({ entityId: 'abc', onUploadComplete });

    await act(async () => {
      result.current.handleFileSelect(
        fileSelectEvent({ file: makeFile('cover.png', 'image/png') })
      );
    });

    await waitFor(() =>
      expect(getPresignedUploadUrlsAction).toHaveBeenCalledWith('artists', 'abc', [
        {
          fileName: 'cover.png',
          contentType: 'image/png',
          fileSize: 1024,
          existingS3Key: 'media/artists/abc/cover.png',
        },
      ])
    );
  });

  it('uploads the file to S3 with the first presigned result', async () => {
    const onUploadComplete = vi.fn(async () => {});
    const file = makeFile();
    const { result } = renderUpload({ entityId: 'abc', onUploadComplete });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file }));
    });

    await waitFor(() =>
      expect(uploadFileToS3).toHaveBeenCalledWith(file, presignedSuccess().data?.[0])
    );
  });

  it('writes the cdn url into the form with dirty and validate flags', async () => {
    const onUploadComplete = vi.fn(async () => {});
    const { result, harness } = renderUpload({ entityId: 'abc', onUploadComplete });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });

    await waitFor(() =>
      expect(harness.setValue).toHaveBeenCalledWith('coverArt', CDN_URL, {
        shouldDirty: true,
        shouldValidate: true,
      })
    );
  });

  it('generates image variants for the uploaded cdn url', async () => {
    const onUploadComplete = vi.fn(async () => {});
    const { result } = renderUpload({ entityId: 'abc', onUploadComplete });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });

    await waitFor(() => expect(generateImageVariantsAction).toHaveBeenCalledWith(CDN_URL));
  });

  it('finalizes the upload with the stable key', async () => {
    const onUploadComplete = vi.fn(async () => {});
    const { result } = renderUpload({ entityId: 'abc', onUploadComplete });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });

    await waitFor(() =>
      expect(finalizeCoverArtUploadAction).toHaveBeenCalledWith('artists', 'abc', S3_KEY)
    );
  });

  it('calls the consumer persistence callback with the cdn url', async () => {
    const onUploadComplete = vi.fn(async () => {});
    const { result } = renderUpload({ entityId: 'abc', onUploadComplete });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });

    await waitFor(() => expect(onUploadComplete).toHaveBeenCalledWith(CDN_URL));
  });

  it('revokes the preview blob after a successful persist', async () => {
    const onUploadComplete = vi.fn(async () => {});
    const { result } = renderUpload({ entityId: 'abc', onUploadComplete });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });

    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith(BLOB_URL));
  });

  it('shows the success toast when variants succeeded', async () => {
    const onUploadComplete = vi.fn(async () => {});
    const { result } = renderUpload({ entityId: 'abc', onUploadComplete });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Cover art uploaded'));
  });

  it('clears the local preview url after success', async () => {
    const onUploadComplete = vi.fn(async () => {});
    const { result } = renderUpload({ entityId: 'abc', onUploadComplete });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });

    await waitFor(() => expect(result.current.localPreviewUrl).toBe(''));
  });

  it('resets the file input value after the upload finishes', async () => {
    const onUploadComplete = vi.fn(async () => {});
    const ref = { current: document.createElement('input') };
    ref.current.value = 'cover.png';
    const { result } = renderUpload({ entityId: 'abc', onUploadComplete, ref });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });

    await waitFor(() => expect(ref.current.value).toBe(''));
  });

  it('leaves isUploading false after the flow completes', async () => {
    const onUploadComplete = vi.fn(async () => {});
    const { result } = renderUpload({ entityId: 'abc', onUploadComplete });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });

    await waitFor(() => expect(result.current.isUploading).toBe(false));
  });
});

// ---------------------------------------------------------------------------
// Variants step branches
// ---------------------------------------------------------------------------

describe('useCoverArtUpload variant generation branches', () => {
  it('suppresses the success toast and warns when variant generation reports failure with an error', async () => {
    generateImageVariantsAction.mockResolvedValue(
      variantsResult({ success: false, error: 'boom' })
    );
    const onUploadComplete = vi.fn(async () => {});
    const { result } = renderUpload({ entityId: 'abc', onUploadComplete });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'Cover uploaded, but variant generation failed: boom. Re-run `pnpm run images:generate-variants` to backfill.'
      )
    );
  });

  it('falls back to "unknown error" when the variant failure has no error message', async () => {
    generateImageVariantsAction.mockResolvedValue(variantsResult({ success: false }));
    const onUploadComplete = vi.fn(async () => {});
    const { result } = renderUpload({ entityId: 'abc', onUploadComplete });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'Cover uploaded, but variant generation failed: unknown error. Re-run `pnpm run images:generate-variants` to backfill.'
      )
    );
  });

  it('does not emit the upload success toast when variants reported failure', async () => {
    generateImageVariantsAction.mockResolvedValue(
      variantsResult({ success: false, error: 'boom' })
    );
    const onUploadComplete = vi.fn(async () => {});
    const { result } = renderUpload({ entityId: 'abc', onUploadComplete });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });

    await waitFor(() => expect(onUploadComplete).toHaveBeenCalled());
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('warns with the message when variant generation throws an Error', async () => {
    generateImageVariantsAction.mockRejectedValue(new Error('variant exploded'));
    const onUploadComplete = vi.fn(async () => {});
    const { result } = renderUpload({ entityId: 'abc', onUploadComplete });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'Cover uploaded, but variant generation threw: variant exploded'
      )
    );
  });

  it('falls back to "Unknown error" when variant generation throws a non-Error', async () => {
    generateImageVariantsAction.mockRejectedValue('string failure');
    const onUploadComplete = vi.fn(async () => {});
    const { result } = renderUpload({ entityId: 'abc', onUploadComplete });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'Cover uploaded, but variant generation threw: Unknown error'
      )
    );
  });

  it('still persists through the callback even when variant generation throws', async () => {
    generateImageVariantsAction.mockRejectedValue(new Error('variant exploded'));
    const onUploadComplete = vi.fn(async () => {});
    const { result } = renderUpload({ entityId: 'abc', onUploadComplete });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });

    await waitFor(() => expect(onUploadComplete).toHaveBeenCalledWith(CDN_URL));
  });
});

// ---------------------------------------------------------------------------
// Finalize step branches
// ---------------------------------------------------------------------------

describe('useCoverArtUpload finalize branches', () => {
  it('warns but still persists when finalize reports failure', async () => {
    finalizeCoverArtUploadAction.mockResolvedValue(
      finalizeResult({ success: false, error: 'nope' })
    );
    const onUploadComplete = vi.fn(async () => {});
    const { result } = renderUpload({ entityId: 'abc', onUploadComplete });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });

    await waitFor(() => expect(onUploadComplete).toHaveBeenCalledWith(CDN_URL));
  });

  it('still persists when finalize throws', async () => {
    finalizeCoverArtUploadAction.mockRejectedValue(new Error('finalize boom'));
    const onUploadComplete = vi.fn(async () => {});
    const { result } = renderUpload({ entityId: 'abc', onUploadComplete });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Cover art uploaded'));
  });
});

// ---------------------------------------------------------------------------
// callUploadComplete failure branch (persistence throws)
// ---------------------------------------------------------------------------

describe('useCoverArtUpload persistence failure', () => {
  it('surfaces the Error message when the persistence callback throws an Error', async () => {
    const onUploadComplete = vi.fn(async () => {
      throw new Error('save failed');
    });
    const { result } = renderUpload({ entityId: 'abc', onUploadComplete });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('save failed'));
  });

  it('falls back to a default message when the persistence callback throws a non-Error', async () => {
    const onUploadComplete = vi.fn(async () => {
      return Promise.reject('plain string');
    });
    const { result } = renderUpload({ entityId: 'abc', onUploadComplete });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Failed to save cover art'));
  });

  it('still revokes the preview blob via the trailing finish after a failed persist', async () => {
    const onUploadComplete = vi.fn(async () => {
      throw new Error('save failed');
    });
    const { result } = renderUpload({ entityId: 'abc', onUploadComplete });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });

    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith(BLOB_URL));
  });

  it('still shows the success toast via the trailing finish after a failed persist', async () => {
    const onUploadComplete = vi.fn(async () => {
      throw new Error('save failed');
    });
    const { result } = renderUpload({ entityId: 'abc', onUploadComplete });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Cover art uploaded'));
  });
});

// ---------------------------------------------------------------------------
// No-callback path (fire-and-forget variants)
// ---------------------------------------------------------------------------

describe('useCoverArtUpload without an upload-complete callback', () => {
  it('fires variant generation without awaiting it', async () => {
    const { result } = renderUpload({ entityId: 'abc' });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });

    await waitFor(() => expect(generateImageVariantsAction).toHaveBeenCalledWith(CDN_URL));
  });

  it('does not call finalize when there is no callback', async () => {
    const { result } = renderUpload({ entityId: 'abc' });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Cover art uploaded'));
    expect(finalizeCoverArtUploadAction).not.toHaveBeenCalled();
  });

  it('shows the success toast on the no-callback path', async () => {
    const { result } = renderUpload({ entityId: 'abc' });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Cover art uploaded'));
  });

  it('warns when fire-and-forget variant generation rejects', async () => {
    generateImageVariantsAction.mockRejectedValue(new Error('async variant boom'));
    const { result } = renderUpload({ entityId: 'abc' });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });

    await waitFor(() =>
      expect(consoleWarn).toHaveBeenCalledWith(
        '[Cover Art] Variant generation failed:',
        expect.any(Error)
      )
    );
  });
});

// ---------------------------------------------------------------------------
// No entityId path (random uuid, no stable key, no existingS3Key, no finalize)
// ---------------------------------------------------------------------------

describe('useCoverArtUpload without an entityId', () => {
  it('generates a random target id when no entityId is supplied', async () => {
    const { result } = renderUpload({ onUploadComplete: vi.fn(async () => {}) });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });

    await waitFor(() =>
      expect(getPresignedUploadUrlsAction).toHaveBeenCalledWith(
        'artists',
        '11111111-1111-1111-1111-111111111111',
        [{ fileName: 'cover.png', contentType: 'image/png', fileSize: 1024 }]
      )
    );
  });

  it('omits the existing s3 key when there is no stable key', async () => {
    const onUploadComplete = vi.fn(async () => {});
    const { result } = renderUpload({ onUploadComplete });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });

    await waitFor(() => expect(randomUUID).toHaveBeenCalledTimes(1));
  });

  it('skips finalize because there is no stable key', async () => {
    const onUploadComplete = vi.fn(async () => {});
    const { result } = renderUpload({ onUploadComplete });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });

    await waitFor(() => expect(onUploadComplete).toHaveBeenCalledWith(CDN_URL));
    expect(finalizeCoverArtUploadAction).not.toHaveBeenCalled();
  });

  it('treats an empty-string entityId as no stable key', async () => {
    const onUploadComplete = vi.fn(async () => {});
    const { result } = renderUpload({ entityId: '', onUploadComplete });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });

    await waitFor(() => expect(randomUUID).toHaveBeenCalledTimes(1));
  });

  it('defaults the inferred extension to jpg when the file name has an empty extension', async () => {
    const onUploadComplete = vi.fn(async () => {});
    const { result } = renderUpload({ entityId: 'abc', onUploadComplete });

    await act(async () => {
      result.current.handleFileSelect(
        fileSelectEvent({ file: makeFile('coverfile.', 'image/png') })
      );
    });

    await waitFor(() =>
      expect(getPresignedUploadUrlsAction).toHaveBeenCalledWith('artists', 'abc', [
        {
          fileName: 'coverfile.',
          contentType: 'image/png',
          fileSize: 1024,
          existingS3Key: 'media/artists/abc/cover.jpg',
        },
      ])
    );
  });
});

// ---------------------------------------------------------------------------
// Empty CDN URL path (finishUpload short-circuit)
// ---------------------------------------------------------------------------

describe('useCoverArtUpload with an empty cdn url', () => {
  it('finishes the upload without generating variants when the cdn url is empty', async () => {
    uploadFileToS3.mockResolvedValue(directUploadSuccess(''));
    const onUploadComplete = vi.fn(async () => {});
    const { result } = renderUpload({ entityId: 'abc', onUploadComplete });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Cover art uploaded'));
    expect(generateImageVariantsAction).not.toHaveBeenCalled();
  });

  it('does not call the persistence callback when the cdn url is empty', async () => {
    uploadFileToS3.mockResolvedValue(directUploadSuccess(''));
    const onUploadComplete = vi.fn(async () => {});
    const { result } = renderUpload({ entityId: 'abc', onUploadComplete });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Cover art uploaded'));
    expect(onUploadComplete).not.toHaveBeenCalled();
  });

  it('still writes the empty value into the form when the cdn url is empty', async () => {
    uploadFileToS3.mockResolvedValue(directUploadSuccess(''));
    const { result, harness } = renderUpload({ entityId: 'abc' });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });

    await waitFor(() =>
      expect(harness.setValue).toHaveBeenCalledWith('coverArt', '', {
        shouldDirty: true,
        shouldValidate: true,
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Upload pipeline error branches (presign + S3)
// ---------------------------------------------------------------------------

describe('useCoverArtUpload upload pipeline errors', () => {
  it('toasts the presign error when presigning fails with an error message', async () => {
    getPresignedUploadUrlsAction.mockResolvedValue(presignedFailure('presign denied'));
    const { result } = renderUpload({ entityId: 'abc' });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('presign denied'));
  });

  it('falls back to a default presign error message when none is provided', async () => {
    getPresignedUploadUrlsAction.mockResolvedValue(presignedFailure());
    const { result } = renderUpload({ entityId: 'abc' });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Failed to get upload URL'));
  });

  it('throws when presigning succeeds but returns no data entry', async () => {
    getPresignedUploadUrlsAction.mockResolvedValue({ success: true, data: [] });
    const { result } = renderUpload({ entityId: 'abc' });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Failed to get upload URL'));
  });

  it('toasts the S3 error when the upload fails with an error message', async () => {
    uploadFileToS3.mockResolvedValue(directUploadFailure('s3 rejected'));
    const { result } = renderUpload({ entityId: 'abc' });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('s3 rejected'));
  });

  it('falls back to a default S3 error message when none is provided', async () => {
    uploadFileToS3.mockResolvedValue(directUploadFailure());
    const { result } = renderUpload({ entityId: 'abc' });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Upload failed'));
  });

  it('falls back to "Upload failed" when the upload step throws a non-Error', async () => {
    getPresignedUploadUrlsAction.mockRejectedValue('not-an-error');
    const { result } = renderUpload({ entityId: 'abc' });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Upload failed'));
  });

  it('resets isUploading to false after an upload error', async () => {
    uploadFileToS3.mockResolvedValue(directUploadFailure('s3 rejected'));
    const { result } = renderUpload({ entityId: 'abc' });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('s3 rejected'));
    expect(result.current.isUploading).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// finally branch: file input ref absent
// ---------------------------------------------------------------------------

describe('useCoverArtUpload with no file input element', () => {
  it('completes without throwing when the file input ref is null', async () => {
    const onUploadComplete = vi.fn(async () => {});
    const { result } = renderUpload({ entityId: 'abc', onUploadComplete });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });

    await waitFor(() => expect(result.current.fileInputRef.current).toBeNull());
  });
});

// ---------------------------------------------------------------------------
// handleFileSelect / handleDrop guards
// ---------------------------------------------------------------------------

describe('useCoverArtUpload file-select guard', () => {
  it('does nothing when no file is selected', async () => {
    const { result } = renderUpload();

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({}));
    });

    expect(getPresignedUploadUrlsAction).not.toHaveBeenCalled();
  });
});

describe('useCoverArtUpload drag and drop', () => {
  it('prevents default and clears drag state on drop', async () => {
    const preventDefault = vi.fn();
    const { result } = renderUpload({ entityId: 'abc' });

    await act(async () => {
      result.current.handleDrop(dropEvent({ file: makeFile(), preventDefault }));
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it('processes the dropped file', async () => {
    const preventDefault = vi.fn();
    const onUploadComplete = vi.fn(async () => {});
    const { result } = renderUpload({ entityId: 'abc', onUploadComplete });

    await act(async () => {
      result.current.handleDrop(dropEvent({ file: makeFile(), preventDefault }));
    });

    await waitFor(() => expect(onUploadComplete).toHaveBeenCalledWith(CDN_URL));
  });

  it('does nothing when the drop carries no file', async () => {
    const preventDefault = vi.fn();
    const { result } = renderUpload({ entityId: 'abc' });

    await act(async () => {
      result.current.handleDrop(dropEvent({ preventDefault }));
    });

    expect(getPresignedUploadUrlsAction).not.toHaveBeenCalled();
  });

  it('sets isDragOver true on drag over', () => {
    const preventDefault = vi.fn();
    const { result } = renderUpload();

    act(() => {
      result.current.handleDragOver(dragEvent(preventDefault));
    });

    expect(result.current.isDragOver).toBe(true);
  });

  it('prevents default on drag over', () => {
    const preventDefault = vi.fn();
    const { result } = renderUpload();

    act(() => {
      result.current.handleDragOver(dragEvent(preventDefault));
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it('sets isDragOver false on drag leave', () => {
    const { result } = renderUpload();

    act(() => {
      result.current.handleDragOver(dragEvent(vi.fn()));
    });
    act(() => {
      result.current.handleDragLeave(dragEvent(vi.fn()));
    });

    expect(result.current.isDragOver).toBe(false);
  });

  it('prevents default on drag leave', () => {
    const preventDefault = vi.fn();
    const { result } = renderUpload();

    act(() => {
      result.current.handleDragLeave(dragEvent(preventDefault));
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// clearPreview + cleanup effect (revokeIfSet)
// ---------------------------------------------------------------------------

describe('useCoverArtUpload clearPreview', () => {
  it('does nothing when there is no local preview', () => {
    const { result } = renderUpload();

    act(() => {
      result.current.clearPreview();
    });

    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it('revokes an existing preview', async () => {
    // A thrown upload leaves the preview url set (the catch never clears it).
    getPresignedUploadUrlsAction.mockRejectedValue(new Error('keep preview'));
    const { result } = renderUpload({ entityId: 'abc' });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });
    await waitFor(() => expect(result.current.localPreviewUrl).toBe(BLOB_URL));
    revokeObjectURL.mockClear();

    act(() => {
      result.current.clearPreview();
    });

    expect(revokeObjectURL).toHaveBeenCalledWith(BLOB_URL);
  });

  it('resets the local preview url to empty after clearPreview', async () => {
    getPresignedUploadUrlsAction.mockRejectedValue(new Error('keep preview'));
    const { result } = renderUpload({ entityId: 'abc' });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });
    await waitFor(() => expect(result.current.localPreviewUrl).toBe(BLOB_URL));

    act(() => {
      result.current.clearPreview();
    });

    expect(result.current.localPreviewUrl).toBe('');
  });

  it('revokes the preview on unmount when one is set', async () => {
    getPresignedUploadUrlsAction.mockRejectedValue(new Error('keep preview'));
    const { result, unmount } = renderUpload({ entityId: 'abc' });

    await act(async () => {
      result.current.handleFileSelect(fileSelectEvent({ file: makeFile() }));
    });
    await waitFor(() => expect(result.current.localPreviewUrl).toBe(BLOB_URL));
    revokeObjectURL.mockClear();

    unmount();

    expect(revokeObjectURL).toHaveBeenCalledWith(BLOB_URL);
  });

  it('does not revoke on unmount when no preview is set', () => {
    const { unmount } = renderUpload();

    unmount();

    expect(revokeObjectURL).not.toHaveBeenCalled();
  });
});
