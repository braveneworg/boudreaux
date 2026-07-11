/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  MAX_REDIRECT_HOPS,
  VALIDATE_LINK_CONCURRENCY,
  VALIDATE_LINK_TIMEOUT_MS,
  validateBioLinks,
} from './validate-bio-links';

vi.mock('server-only', () => ({}));

const vetHostnameMock = vi.fn();
const closeMock = vi.fn();
const buildPinnedDispatcherMock = vi.fn((_address: string, _family: number) => ({
  close: closeMock,
}));
vi.mock('@/lib/utils/ssrf-fetch', () => ({
  vetHostname: (hostname: string) => vetHostnameMock(hostname),
  buildPinnedDispatcher: (address: string, family: number) =>
    buildPinnedDispatcherMock(address, family),
}));

const mediaInfoMock = vi.fn();
const mediaWarnMock = vi.fn();
vi.mock('@/lib/utils/logger', () => ({
  loggers: {
    media: {
      info: (event: string, payload: unknown) => mediaInfoMock(event, payload),
      warn: (event: string, payload: unknown) => mediaWarnMock(event, payload),
    },
  },
}));

const statusResponse = (status: number, headers?: Record<string, string>): Response =>
  new Response(null, { status, headers });

const vetOk = { ok: true, address: '93.184.216.34', family: 4 };
const vetDisallowed = { ok: false, reason: 'disallowed', address: '10.0.0.1' };
const vetDnsFailure = { ok: false, reason: 'dns_failure', error: new Error('ENOTFOUND') };

// Route the fetch stub by target hostname; unrouted hosts answer 200.
const routeFetchByHostname = (
  fetchMock: ReturnType<typeof vi.fn>,
  routes: Record<string, () => Response>
): void => {
  const table = new Map(Object.entries(routes));
  fetchMock.mockImplementation((input: string) => {
    const route = table.get(new URL(input).hostname);
    return Promise.resolve(route ? route() : statusResponse(200));
  });
};

// Drain the microtask queue so every idle pool worker reaches its next await.
const flushMicrotasks = async (): Promise<void> => {
  for (let tick = 0; tick < 25; tick += 1) {
    await Promise.resolve();
  }
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vetHostnameMock.mockResolvedValue({ ...vetOk });
  closeMock.mockResolvedValue(undefined);
  fetchMock = vi.fn(() => Promise.resolve(statusResponse(200)));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('validateBioLinks', () => {
  it('exports the probe constants from the brief', () => {
    expect({ VALIDATE_LINK_TIMEOUT_MS, MAX_REDIRECT_HOPS, VALIDATE_LINK_CONCURRENCY }).toEqual({
      VALIDATE_LINK_TIMEOUT_MS: 5_000,
      MAX_REDIRECT_HOPS: 2,
      VALIDATE_LINK_CONCURRENCY: 6,
    });
  });

  describe('E2E short-circuit', () => {
    it('returns the same array back in E2E_MODE', async () => {
      vi.stubEnv('E2E_MODE', 'true');
      const links = [{ url: 'https://e2e.test/' }];

      await expect(validateBioLinks(links)).resolves.toBe(links);
    });

    it('never fetches in E2E_MODE', async () => {
      vi.stubEnv('E2E_MODE', 'true');

      await validateBioLinks([{ url: 'https://e2e.test/' }]);

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('never vets hostnames in E2E_MODE', async () => {
      vi.stubEnv('E2E_MODE', 'true');

      await validateBioLinks([{ url: 'https://e2e.test/' }]);

      expect(vetHostnameMock).not.toHaveBeenCalled();
    });

    it('logs nothing in E2E_MODE', async () => {
      vi.stubEnv('E2E_MODE', 'true');

      await validateBioLinks([{ url: 'https://e2e.test/' }]);

      expect(mediaInfoMock).not.toHaveBeenCalled();
      expect(mediaWarnMock).not.toHaveBeenCalled();
    });
  });

  describe('keep/drop classification', () => {
    it('keeps a 200 link', async () => {
      const links = [{ url: 'https://alive.test/' }];

      await expect(validateBioLinks(links)).resolves.toEqual(links);
    });

    it('passes the caller link objects through by reference', async () => {
      const links = [{ url: 'https://alive.test/', label: 'A', sortOrder: 3 }];

      const result = await validateBioLinks(links);

      expect(result[0]).toBe(links[0]);
    });

    it('drops a 404 link', async () => {
      fetchMock.mockResolvedValue(statusResponse(404));

      await expect(validateBioLinks([{ url: 'https://gone.test/' }])).resolves.toEqual([]);
    });

    it('drops a 410 link', async () => {
      fetchMock.mockResolvedValue(statusResponse(410));

      await expect(validateBioLinks([{ url: 'https://tombstone.test/' }])).resolves.toEqual([]);
    });

    it('preserves the original input order across drops', async () => {
      routeFetchByHostname(fetchMock, { 'gone.test': () => statusResponse(404) });
      const links = [
        { url: 'https://first.test/' },
        { url: 'https://gone.test/' },
        { url: 'https://last.test/' },
      ];

      await expect(validateBioLinks(links)).resolves.toEqual([links[0], links[2]]);
    });

    it('drops on DNS failure without fetching', async () => {
      vetHostnameMock.mockResolvedValue({ ...vetDnsFailure });

      const result = await validateBioLinks([{ url: 'https://dnsfail.test/' }]);

      expect(result).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('drops on a disallowed address without fetching', async () => {
      vetHostnameMock.mockResolvedValue({ ...vetDisallowed });

      const result = await validateBioLinks([{ url: 'https://blocked.test/' }]);

      expect(result).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('keeps a link whose probe times out', async () => {
      fetchMock.mockRejectedValue(
        Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' })
      );
      const links = [{ url: 'https://slow.test/' }];

      await expect(validateBioLinks(links)).resolves.toEqual(links);
    });

    it('keeps a 429 link', async () => {
      fetchMock.mockResolvedValue(statusResponse(429));
      const links = [{ url: 'https://ratelimited.test/' }];

      await expect(validateBioLinks(links)).resolves.toEqual(links);
    });

    it('keeps a 500 link', async () => {
      fetchMock.mockResolvedValue(statusResponse(500));
      const links = [{ url: 'https://flaky.test/' }];

      await expect(validateBioLinks(links)).resolves.toEqual(links);
    });

    it('keeps a 403 link', async () => {
      fetchMock.mockResolvedValue(statusResponse(403));
      const links = [{ url: 'https://forbidden.test/' }];

      await expect(validateBioLinks(links)).resolves.toEqual(links);
    });

    it('probes with a manual-redirect HEAD request', async () => {
      await validateBioLinks([{ url: 'https://alive.test/' }]);

      expect(fetchMock).toHaveBeenCalledWith(
        'https://alive.test/',
        expect.objectContaining({
          method: 'HEAD',
          redirect: 'manual',
          signal: expect.any(AbortSignal),
        })
      );
    });

    it('closes the dispatcher after the probe', async () => {
      await validateBioLinks([{ url: 'https://alive.test/' }]);

      expect(closeMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('HEAD → GET fallback', () => {
    const respondByMethod = (headStatus: number, getStatus: number): void => {
      fetchMock.mockImplementation((_input: string, init?: { method?: string }) =>
        Promise.resolve(statusResponse(init?.method === 'GET' ? getStatus : headStatus))
      );
    };

    it('keeps the link when a 405 HEAD retries as GET 200', async () => {
      respondByMethod(405, 200);
      const links = [{ url: 'https://nohead.test/' }];

      await expect(validateBioLinks(links)).resolves.toEqual(links);
    });

    it('drops the link when a 405 HEAD retries as GET 404', async () => {
      respondByMethod(405, 404);

      await expect(validateBioLinks([{ url: 'https://nohead.test/' }])).resolves.toEqual([]);
    });

    it('retries a 501 HEAD as GET', async () => {
      respondByMethod(501, 200);

      await validateBioLinks([{ url: 'https://nohead.test/' }]);

      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        'https://nohead.test/',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('reuses the vetted dispatcher for the GET retry', async () => {
      respondByMethod(405, 200);

      await validateBioLinks([{ url: 'https://nohead.test/' }]);

      expect(buildPinnedDispatcherMock).toHaveBeenCalledTimes(1);
    });

    it('cancels the GET body instead of buffering it', async () => {
      const cancelSpy = vi.fn();
      const body = new ReadableStream<Uint8Array>({
        start: (controller) => {
          controller.enqueue(new Uint8Array([1, 2, 3]));
        },
        cancel: cancelSpy,
      });
      fetchMock.mockImplementation((_input: string, init?: { method?: string }) =>
        Promise.resolve(
          init?.method === 'GET' ? new Response(body, { status: 200 }) : statusResponse(405)
        )
      );

      await validateBioLinks([{ url: 'https://nohead.test/' }]);

      expect(cancelSpy).toHaveBeenCalled();
    });

    it('keeps the link when the GET body cancel rejects', async () => {
      const body = new ReadableStream<Uint8Array>({
        start: (controller) => {
          controller.enqueue(new Uint8Array([1]));
        },
        cancel: () => {
          throw new Error('cancel boom');
        },
      });
      fetchMock.mockImplementation((_input: string, init?: { method?: string }) =>
        Promise.resolve(
          init?.method === 'GET' ? new Response(body, { status: 200 }) : statusResponse(405)
        )
      );
      const links = [{ url: 'https://nohead.test/' }];

      await expect(validateBioLinks(links)).resolves.toEqual(links);
    });
  });

  describe('redirects', () => {
    it('re-vets the redirect target hostname', async () => {
      routeFetchByHostname(fetchMock, {
        'start.test': () => statusResponse(301, { location: 'https://target.test/' }),
      });

      await validateBioLinks([{ url: 'https://start.test/' }]);

      expect(vetHostnameMock).toHaveBeenCalledWith('target.test');
    });

    it('keeps the link when the redirect target answers 200', async () => {
      routeFetchByHostname(fetchMock, {
        'start.test': () => statusResponse(301, { location: 'https://target.test/' }),
      });
      const links = [{ url: 'https://start.test/' }];

      await expect(validateBioLinks(links)).resolves.toEqual(links);
    });

    it('drops the link when the redirect target answers 404', async () => {
      routeFetchByHostname(fetchMock, {
        'start.test': () => statusResponse(302, { location: 'https://target.test/' }),
        'target.test': () => statusResponse(404),
      });

      await expect(validateBioLinks([{ url: 'https://start.test/' }])).resolves.toEqual([]);
    });

    it('drops the link when the redirect target host is disallowed', async () => {
      vetHostnameMock.mockImplementation((hostname: string) =>
        Promise.resolve(hostname === 'blocked.test' ? { ...vetDisallowed } : { ...vetOk })
      );
      routeFetchByHostname(fetchMock, {
        'start.test': () => statusResponse(301, { location: 'https://blocked.test/' }),
      });

      await expect(validateBioLinks([{ url: 'https://start.test/' }])).resolves.toEqual([]);
    });

    it('drops the link when a redirect hop DNS-fails', async () => {
      vetHostnameMock.mockImplementation((hostname: string) =>
        Promise.resolve(hostname === 'dnsfail.test' ? { ...vetDnsFailure } : { ...vetOk })
      );
      routeFetchByHostname(fetchMock, {
        'start.test': () => statusResponse(301, { location: 'https://dnsfail.test/' }),
      });

      await expect(validateBioLinks([{ url: 'https://start.test/' }])).resolves.toEqual([]);
    });

    it('keeps the link after more than MAX_REDIRECT_HOPS redirects', async () => {
      routeFetchByHostname(fetchMock, {
        'hop0.test': () => statusResponse(301, { location: 'https://hop1.test/' }),
        'hop1.test': () => statusResponse(301, { location: 'https://hop2.test/' }),
        'hop2.test': () => statusResponse(301, { location: 'https://hop3.test/' }),
      });
      const links = [{ url: 'https://hop0.test/' }];

      await expect(validateBioLinks(links)).resolves.toEqual(links);
    });

    it('stops probing once the hop budget is exhausted', async () => {
      fetchMock.mockResolvedValue(statusResponse(301, { location: 'https://loop.test/' }));

      await validateBioLinks([{ url: 'https://loop.test/' }]);

      expect(fetchMock).toHaveBeenCalledTimes(MAX_REDIRECT_HOPS + 1);
    });

    it('keeps the link on a 3xx without a location header', async () => {
      fetchMock.mockResolvedValue(statusResponse(301));
      const links = [{ url: 'https://nowhere.test/' }];

      await expect(validateBioLinks(links)).resolves.toEqual(links);
    });

    it('resolves a relative location against the current URL', async () => {
      fetchMock.mockImplementation((input: string) =>
        Promise.resolve(
          input === 'https://rel.test/old'
            ? statusResponse(301, { location: '/moved' })
            : statusResponse(200)
        )
      );

      await validateBioLinks([{ url: 'https://rel.test/old' }]);

      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        'https://rel.test/moved',
        expect.objectContaining({ method: 'HEAD' })
      );
    });

    it('keeps the link on a redirect to a non-http(s) scheme', async () => {
      fetchMock.mockResolvedValue(statusResponse(301, { location: 'ftp://files.test/x' }));
      const links = [{ url: 'https://ftp-redirect.test/' }];

      const result = await validateBioLinks(links);

      expect(result).toEqual(links);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('non-probeable URLs', () => {
    it('keeps a relative URL with zero network activity', async () => {
      const links = [{ url: '/releases/abc' }];

      const result = await validateBioLinks(links);

      expect(result).toEqual(links);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(vetHostnameMock).not.toHaveBeenCalled();
    });

    it('keeps a mailto: URL with zero network activity', async () => {
      const links = [{ url: 'mailto:booking@example.com' }];

      const result = await validateBioLinks(links);

      expect(result).toEqual(links);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(vetHostnameMock).not.toHaveBeenCalled();
    });
  });

  describe('concurrency', () => {
    it('probes at most VALIDATE_LINK_CONCURRENCY links at a time', async () => {
      const releases: Array<(response: Response) => void> = [];
      fetchMock.mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            releases.push(resolve);
          })
      );
      const links = Array.from({ length: 8 }, (_, index) => ({
        url: `https://pool${index}.test/`,
      }));

      const resultPromise = validateBioLinks(links);
      await flushMicrotasks();
      expect(releases).toHaveLength(VALIDATE_LINK_CONCURRENCY);

      releases.splice(0).forEach((release) => release(statusResponse(200)));
      await flushMicrotasks();
      expect(releases).toHaveLength(links.length - VALIDATE_LINK_CONCURRENCY);

      releases.splice(0).forEach((release) => release(statusResponse(200)));
      await expect(resultPromise).resolves.toHaveLength(links.length);
    });
  });

  describe('resilience', () => {
    it('keeps a link whose fetch throws synchronously, leaving others unaffected', async () => {
      fetchMock.mockImplementation((input: string) => {
        if (new URL(input).hostname === 'boom.test') throw new TypeError('fetch boom');
        return Promise.resolve(statusResponse(404));
      });
      const links = [{ url: 'https://boom.test/' }, { url: 'https://gone.test/' }];

      await expect(validateBioLinks(links)).resolves.toEqual([links[0]]);
    });

    it('keeps a link when vetHostname itself throws', async () => {
      vetHostnameMock.mockImplementation(() => {
        throw new Error('vet boom');
      });
      const links = [{ url: 'https://vetboom.test/' }];

      await expect(validateBioLinks(links)).resolves.toEqual(links);
    });

    it('keeps the verdict when the dispatcher close rejects', async () => {
      closeMock.mockRejectedValue(new Error('close boom'));
      const links = [{ url: 'https://alive.test/' }];

      await expect(validateBioLinks(links)).resolves.toEqual(links);
    });
  });

  describe('telemetry', () => {
    it('warns with the full summary payload when links were dropped', async () => {
      vetHostnameMock.mockImplementation((hostname: string) => {
        if (hostname === 'dnsfail.test') return Promise.resolve({ ...vetDnsFailure });
        if (hostname === 'blocked.test') return Promise.resolve({ ...vetDisallowed });
        return Promise.resolve({ ...vetOk });
      });
      routeFetchByHostname(fetchMock, { 'gone.test': () => statusResponse(404) });
      const links = [
        { url: 'https://dnsfail.test/' },
        { url: 'https://blocked.test/' },
        { url: 'https://gone.test/' },
        { url: 'https://alive.test/' },
      ];

      await validateBioLinks(links);

      expect(mediaWarnMock).toHaveBeenCalledWith('bio_link_validation', {
        total: 4,
        kept: 1,
        dropped: 3,
        drops: [
          { url: 'https://dnsfail.test/', reason: 'dns_failure' },
          { url: 'https://blocked.test/', reason: 'ssrf_disallowed' },
          { url: 'https://gone.test/', reason: 'gone' },
        ],
      });
      expect(mediaInfoMock).not.toHaveBeenCalled();
    });

    it('logs info with the summary payload when nothing dropped', async () => {
      await validateBioLinks([{ url: 'https://alive.test/' }]);

      expect(mediaInfoMock).toHaveBeenCalledWith('bio_link_validation', {
        total: 1,
        kept: 1,
        dropped: 0,
        drops: [],
      });
      expect(mediaWarnMock).not.toHaveBeenCalled();
    });
  });

  describe('immutability', () => {
    it('does not mutate the input link objects', async () => {
      routeFetchByHostname(fetchMock, { 'gone.test': () => statusResponse(404) });
      const links = [
        { url: 'https://alive.test/', sortOrder: 0 },
        { url: 'https://gone.test/', sortOrder: 1 },
      ];
      const snapshot = structuredClone(links);

      await validateBioLinks(links);

      expect(links).toEqual(snapshot);
    });
  });
});
