/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  CompareFacesCommand,
  DetectFacesCommand,
  RekognitionClient,
} from '@aws-sdk/client-rekognition';

import { annotateFaces, fetchReferenceBytes } from './rekognition.js';
import { VISION_FETCH_MAX_BYTES } from './vision.js';

import type { VerifiedScrapedImage } from './vision.js';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('@aws-sdk/client-rekognition', () => ({
  RekognitionClient: class {
    send = send;
  },
  DetectFacesCommand: class {
    constructor(public input: { Image?: { Bytes?: Uint8Array } }) {}
  },
  CompareFacesCommand: class {
    constructor(
      public input: {
        SourceImage?: { Bytes?: Uint8Array };
        TargetImage?: { Bytes?: Uint8Array };
        SimilarityThreshold?: number;
      }
    ) {}
  },
}));

const client = new RekognitionClient({});

/**
 * Builds a verified survivor whose bytes decode to the given ASCII marker, so a
 * responder that does `Buffer.from(input.Image.Bytes).toString()` reads `marker`
 * back — exercising the real `Buffer.from(base64, 'base64')` decode path.
 */
const survivor = (marker: string): VerifiedScrapedImage => ({
  image: {
    url: `https://a.com/${marker}.jpg`,
    thumbnailUrl: null,
    title: null,
    attribution: 'somezine.net',
    license: null,
    sourceUrl: null,
    width: null,
    height: null,
    isPrimary: false,
  },
  mimeType: 'image/jpeg',
  base64: Buffer.from(marker).toString('base64'),
});

/** Structured log lines of `event` captured from the given console method's spy. */
const eventsFrom = (method: 'info' | 'warn', event: string): Array<Record<string, unknown>> => {
  const spy = method === 'info' ? vi.mocked(console.info) : vi.mocked(console.warn);
  return spy.mock.calls
    .map((call) => JSON.parse(call[0] as string) as Record<string, unknown>)
    .filter((entry) => entry.event === event);
};

/** A send mock that routes DetectFaces / CompareFaces to the supplied responders. */
const routeSend = (responders: {
  detect?: (input: { Image?: { Bytes?: Uint8Array } }) => unknown;
  compare?: (input: {
    SourceImage?: { Bytes?: Uint8Array };
    TargetImage?: { Bytes?: Uint8Array };
  }) => unknown;
}): void => {
  send.mockImplementation(async (command: { input: unknown }) => {
    if (command instanceof DetectFacesCommand) {
      return responders.detect?.(command.input) ?? { FaceDetails: [] };
    }
    if (command instanceof CompareFacesCommand) {
      return responders.compare?.(command.input) ?? { FaceMatches: [] };
    }
    throw new Error('unexpected command');
  });
};

beforeEach(() => {
  send.mockReset();
});

describe('annotateFaces', () => {
  it('returns [] and makes no client calls when candidates is empty', async () => {
    const result = await annotateFaces([], [Buffer.from('ref')], client);
    expect(result).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });

  it('maps a detected face to hasFace true and an undetected face to hasFace false', async () => {
    routeSend({
      detect: (input) =>
        Buffer.from(input.Image?.Bytes ?? []).toString() === 'yes'
          ? { FaceDetails: [{}] }
          : { FaceDetails: [] },
    });
    const result = await annotateFaces([survivor('yes'), survivor('no')], [], client);
    expect(result[0].hasFace).toBe(true);
    expect(result[1].hasFace).toBe(false);
  });

  it('sends the candidate bytes decoded from base64 to DetectFaces', async () => {
    const seen: string[] = [];
    routeSend({
      detect: (input) => {
        seen.push(Buffer.from(input.Image?.Bytes ?? []).toString());
        return { FaceDetails: [] };
      },
    });
    await annotateFaces([survivor('hello')], [], client);
    expect(seen).toEqual(['hello']);
  });

  it('with no reference bytes, a detected face scores faceScore null (DetectFaces only)', async () => {
    routeSend({ detect: () => ({ FaceDetails: [{}] }) });
    const result = await annotateFaces([survivor('yes')], [], client);
    expect(result[0].hasFace).toBe(true);
    expect(result[0].faceScore).toBeNull();
  });

  it('scores faceScore as the max CompareFaces similarity across references', async () => {
    // Each reference scores differently; the higher one (91.2) must win.
    const similarityByRef = new Map([
      ['r1', 82.5],
      ['r2', 91.2],
    ]);
    routeSend({
      detect: () => ({ FaceDetails: [{}] }),
      compare: (input) => ({
        FaceMatches: [
          {
            Similarity: similarityByRef.get(Buffer.from(input.SourceImage?.Bytes ?? []).toString()),
          },
        ],
      }),
    });
    const refs = [Buffer.from('r1'), Buffer.from('r2')];
    const result = await annotateFaces([survivor('yes')], refs, client);
    expect(result[0].faceScore).toBe(91.2);
  });

  it('sends each reference as the source and the candidate as the target', async () => {
    const pairs: Array<{ source: string; target: string }> = [];
    routeSend({
      detect: () => ({ FaceDetails: [{}] }),
      compare: (input) => {
        pairs.push({
          source: Buffer.from(input.SourceImage?.Bytes ?? []).toString(),
          target: Buffer.from(input.TargetImage?.Bytes ?? []).toString(),
        });
        return { FaceMatches: [{ Similarity: 50 }] };
      },
    });
    await annotateFaces([survivor('cand')], [Buffer.from('ref-a'), Buffer.from('ref-b')], client);
    expect(pairs).toEqual([
      { source: 'ref-a', target: 'cand' },
      { source: 'ref-b', target: 'cand' },
    ]);
  });

  it('scores faceScore 0 when CompareFaces returns no matches for any reference', async () => {
    routeSend({
      detect: () => ({ FaceDetails: [{}] }),
      compare: () => ({ FaceMatches: [] }),
    });
    const result = await annotateFaces([survivor('yes')], [Buffer.from('ref')], client);
    expect(result[0].faceScore).toBe(0);
  });

  it('never calls CompareFaces when hasFace is false', async () => {
    let compareCalls = 0;
    routeSend({
      detect: () => ({ FaceDetails: [] }),
      compare: () => {
        compareCalls += 1;
        return { FaceMatches: [] };
      },
    });
    const result = await annotateFaces([survivor('no')], [Buffer.from('ref')], client);
    expect(result[0].faceScore).toBeNull();
    expect(compareCalls).toBe(0);
  });

  it('isolates a per-candidate AWS error to nulls for that candidate, siblings unaffected', async () => {
    routeSend({
      detect: (input) => {
        if (Buffer.from(input.Image?.Bytes ?? []).toString() === 'boom') {
          throw new Error('AccessDenied');
        }
        return { FaceDetails: [{}] };
      },
    });
    const result = await annotateFaces([survivor('boom'), survivor('ok')], [], client);
    expect(result[0]).toEqual({ hasFace: null, faceScore: null });
    expect(result[1].hasFace).toBe(true);
  });

  it('skips a failing reference and scores against the surviving one', async () => {
    // Ref r1 has no detectable face → InvalidParameterException; r2 scores 88.
    routeSend({
      detect: () => ({ FaceDetails: [{}] }),
      compare: (input) => {
        if (Buffer.from(input.SourceImage?.Bytes ?? []).toString() === 'r1') {
          throw new Error('InvalidParameterException');
        }
        return { FaceMatches: [{ Similarity: 88 }] };
      },
    });
    const refs = [Buffer.from('r1'), Buffer.from('r2')];
    const [only] = await annotateFaces([survivor('cand')], refs, client);
    expect(only).toEqual({ hasFace: true, faceScore: 88 });
  });

  it('keeps hasFace true with a null faceScore when every reference fails', async () => {
    routeSend({
      detect: () => ({ FaceDetails: [{}] }),
      compare: () => {
        throw new Error('InvalidImageFormatException');
      },
    });
    const refs = [Buffer.from('r1'), Buffer.from('r2')];
    const [only] = await annotateFaces([survivor('cand')], refs, client);
    expect(only).toEqual({ hasFace: true, faceScore: null });
  });

  it('does not degrade a sibling candidate when a reference fails', async () => {
    routeSend({
      detect: () => ({ FaceDetails: [{}] }),
      compare: (input) => {
        if (Buffer.from(input.SourceImage?.Bytes ?? []).toString() === 'bad') {
          throw new Error('InvalidParameterException');
        }
        return { FaceMatches: [{ Similarity: 60 }] };
      },
    });
    const refs = [Buffer.from('bad')];
    const result = await annotateFaces([survivor('a'), survivor('b')], refs, client);
    expect(result[0].hasFace).toBe(true);
    expect(result[1].hasFace).toBe(true);
  });

  it('skips an unsupported-format candidate without any client call and returns nulls', async () => {
    routeSend({ detect: () => ({ FaceDetails: [{}] }) });
    const webp: VerifiedScrapedImage = {
      ...survivor('webp'),
      mimeType: 'image/webp',
    };
    const [only] = await annotateFaces([webp], [Buffer.from('ref')], client);
    expect(only).toEqual({ hasFace: null, faceScore: null });
    expect(send).not.toHaveBeenCalled();
  });

  it('still analyzes jpeg and png candidates alongside a skipped webp', async () => {
    routeSend({ detect: () => ({ FaceDetails: [{}] }) });
    const png: VerifiedScrapedImage = { ...survivor('png'), mimeType: 'image/png' };
    const webp: VerifiedScrapedImage = { ...survivor('webp'), mimeType: 'image/webp' };
    const result = await annotateFaces([survivor('jpg'), png, webp], [], client);
    expect(result[0].hasFace).toBe(true);
    expect(result[1].hasFace).toBe(true);
    expect(result[2]).toEqual({ hasFace: null, faceScore: null });
  });

  it('counts unsupported-format candidates as skipped in rekognition_annotated', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    routeSend({ detect: () => ({ FaceDetails: [{}] }) });
    const webp: VerifiedScrapedImage = { ...survivor('webp'), mimeType: 'image/webp' };
    await annotateFaces([survivor('jpg'), webp], [], client);
    expect(eventsFrom('info', 'rekognition_annotated')[0]).toMatchObject({
      candidates: 2,
      skipped: 1,
    });
    info.mockRestore();
  });

  it('logs one rekognition_failed warn for the failing candidate', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    routeSend({
      detect: () => {
        throw new Error('AccessDenied');
      },
    });
    await annotateFaces([survivor('boom')], [], client);
    expect(eventsFrom('warn', 'rekognition_failed')).toHaveLength(1);
    warn.mockRestore();
  });

  it('logs rekognition_annotated once with candidates, withFace and scored counts', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    routeSend({
      detect: (input) =>
        Buffer.from(input.Image?.Bytes ?? []).toString() === 'face'
          ? { FaceDetails: [{}] }
          : { FaceDetails: [] },
      compare: () => ({ FaceMatches: [{ Similarity: 70 }] }),
    });
    await annotateFaces([survivor('face'), survivor('none')], [Buffer.from('ref')], client);
    expect(eventsFrom('info', 'rekognition_annotated')[0]).toMatchObject({
      candidates: 2,
      withFace: 1,
      scored: 1,
    });
    info.mockRestore();
  });

  it('preserves input order despite a concurrency pool', async () => {
    routeSend({
      detect: (input) => ({
        FaceDetails: Buffer.from(input.Image?.Bytes ?? [])
          .toString()
          .startsWith('f')
          ? [{}]
          : [],
      }),
    });
    const candidates = Array.from({ length: 10 }, (_, i) =>
      survivor(i % 2 === 0 ? `f${i}` : `n${i}`)
    );
    const result = await annotateFaces(candidates, [], client);
    expect(result.map((annotation) => annotation.hasFace)).toEqual([
      true,
      false,
      true,
      false,
      true,
      false,
      true,
      false,
      true,
      false,
    ]);
  });
});

describe('fetchReferenceBytes', () => {
  const imageResponse = (bytes: number[]): Response =>
    new Response(new Uint8Array(bytes), {
      status: 200,
      headers: { 'Content-Type': 'image/jpeg', 'Content-Length': String(bytes.length) },
    });

  it('returns [] for no urls', async () => {
    const fetchFn = vi.fn();
    const result = await fetchReferenceBytes([], fetchFn);
    expect(result).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('fetches at most the first three of five urls', async () => {
    const fetchFn = vi.fn(async () => imageResponse([1, 2, 3]));
    const result = await fetchReferenceBytes(
      ['https://x/1', 'https://x/2', 'https://x/3', 'https://x/4', 'https://x/5'],
      fetchFn
    );
    expect(result).toHaveLength(3);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('returns the fetched bytes as buffers', async () => {
    const fetchFn = vi.fn(async () => imageResponse([9, 8, 7]));
    const result = await fetchReferenceBytes(['https://x/1'], fetchFn);
    expect(Array.from(result[0])).toEqual([9, 8, 7]);
  });

  it('skips a non-image response', async () => {
    const fetchFn = vi.fn(
      async () => new Response('html', { status: 200, headers: { 'Content-Type': 'text/html' } })
    );
    const result = await fetchReferenceBytes(['https://x/1'], fetchFn);
    expect(result).toEqual([]);
  });

  it('skips a response whose content-length header is oversized', async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: {
            'Content-Type': 'image/jpeg',
            'Content-Length': String(VISION_FETCH_MAX_BYTES + 1),
          },
        })
    );
    const result = await fetchReferenceBytes(['https://x/1'], fetchFn);
    expect(result).toEqual([]);
  });

  it('skips a failed (network-error) reference without throwing', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(imageResponse([5]));
    const result = await fetchReferenceBytes(['https://x/1', 'https://x/2'], fetchFn);
    expect(result).toHaveLength(1);
    expect(Array.from(result[0])).toEqual([5]);
  });

  it('skips a non-ok response', async () => {
    const fetchFn = vi.fn(async () => new Response('nope', { status: 404 }));
    const result = await fetchReferenceBytes(['https://x/1'], fetchFn);
    expect(result).toEqual([]);
  });

  it('logs reference_images_fetched at info when every attempted url is fetched', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const fetchFn = vi.fn(async () => imageResponse([1]));
    await fetchReferenceBytes(['https://x/1', 'https://x/2'], fetchFn);
    expect(eventsFrom('info', 'reference_images_fetched')[0]).toMatchObject({
      requested: 2,
      fetched: 2,
    });
    info.mockRestore();
  });

  it('logs reference_images_fetched at warn when an oversized reference is dropped', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(imageResponse([1]))
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1]), {
          status: 200,
          headers: {
            'Content-Type': 'image/jpeg',
            'Content-Length': String(VISION_FETCH_MAX_BYTES + 1),
          },
        })
      );
    await fetchReferenceBytes(['https://x/1', 'https://x/2'], fetchFn);
    expect(eventsFrom('warn', 'reference_images_fetched')[0]).toMatchObject({
      requested: 2,
      fetched: 1,
    });
    warn.mockRestore();
  });

  it('caps the reference_images_fetched requested count at three', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const fetchFn = vi.fn(async () => imageResponse([1]));
    await fetchReferenceBytes(
      ['https://x/1', 'https://x/2', 'https://x/3', 'https://x/4'],
      fetchFn
    );
    expect(eventsFrom('info', 'reference_images_fetched')[0]).toMatchObject({
      requested: 3,
      fetched: 3,
    });
    info.mockRestore();
  });

  it('does not log reference_images_fetched when no urls are supplied', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await fetchReferenceBytes([], vi.fn());
    expect(eventsFrom('info', 'reference_images_fetched')).toHaveLength(0);
    expect(eventsFrom('warn', 'reference_images_fetched')).toHaveLength(0);
    info.mockRestore();
    warn.mockRestore();
  });
});
