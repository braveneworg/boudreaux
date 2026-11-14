/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { isUploadAbort, putWithProgress } from './put-with-progress';

type Listener = (event: { lengthComputable?: boolean; loaded?: number; total?: number }) => void;

/** A stand-in for XMLHttpRequest that records what it was asked and fires on demand. */
class FakeXhr {
  static last: FakeXhr | undefined;

  status = 0;
  method = '';
  url = '';
  body: unknown;
  sent = false;
  aborted = false;
  headers = new Map<string, string>();
  listeners = new Map<string, Listener>();
  upload = {
    listeners: new Map<string, Listener>(),
    addEventListener: (type: string, listener: Listener): void => {
      this.upload.listeners.set(type, listener);
    },
  };

  constructor() {
    FakeXhr.last = this;
  }

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string): void {
    this.headers.set(name, value);
  }

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, listener);
  }

  send(body: unknown): void {
    this.sent = true;
    this.body = body;
  }

  abort(): void {
    this.aborted = true;
    this.listeners.get('abort')?.({});
  }

  /** Finish the request with `status`. */
  respond(status: number): void {
    this.status = status;
    this.listeners.get('load')?.({});
  }
}

const file = new Blob(['abc'], { type: 'image/png' });
const URL = 'https://signed.example/put';

const xhr = (): FakeXhr => {
  if (!FakeXhr.last) {
    throw new Error('no request was made');
  }

  return FakeXhr.last;
};

beforeEach(() => {
  FakeXhr.last = undefined;
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('putWithProgress', () => {
  it('PUTs the body to the URL', async () => {
    const upload = putWithProgress(URL, file, { contentType: 'image/png' });
    xhr().respond(200);
    await upload;

    expect({ method: xhr().method, url: xhr().url, body: xhr().body }).toEqual({
      method: 'PUT',
      url: URL,
      body: file,
    });
  });

  it('sends exactly the content type it was given', async () => {
    const upload = putWithProgress(URL, file, { contentType: 'image/png' });
    xhr().respond(200);
    await upload;

    expect(xhr().headers.get('Content-Type')).toBe('image/png');
  });

  it('reports progress as a fraction', async () => {
    const onProgress = vi.fn();
    const upload = putWithProgress(URL, file, { contentType: 'image/png', onProgress });
    xhr().upload.listeners.get('progress')?.({ lengthComputable: true, loaded: 1, total: 4 });
    xhr().respond(200);
    await upload;

    expect(onProgress.mock.calls).toEqual([[0.25]]);
  });

  it('reports nothing for an event without a total', async () => {
    const onProgress = vi.fn();
    const upload = putWithProgress(URL, file, { contentType: 'image/png', onProgress });
    xhr().upload.listeners.get('progress')?.({ lengthComputable: false, loaded: 1, total: 0 });
    xhr().respond(200);
    await upload;

    expect(onProgress).not.toHaveBeenCalled();
  });

  it('rejects when the store refuses the upload', async () => {
    const upload = putWithProgress(URL, file, { contentType: 'image/png' });
    xhr().respond(403);

    await expect(upload).rejects.toThrow('The upload was refused (403).');
  });

  it('rejects when the connection fails', async () => {
    const upload = putWithProgress(URL, file, { contentType: 'image/png' });
    xhr().listeners.get('error')?.({});

    await expect(upload).rejects.toThrow('The upload did not finish. Check your connection.');
  });

  it('aborts the request when its signal fires', async () => {
    const controller = new AbortController();
    const upload = putWithProgress(URL, file, {
      contentType: 'image/png',
      signal: controller.signal,
    });
    controller.abort();
    await upload.catch(() => undefined);

    expect(xhr().aborted).toBe(true);
  });

  it('rejects an aborted upload as an abort', async () => {
    const controller = new AbortController();
    const upload = putWithProgress(URL, file, {
      contentType: 'image/png',
      signal: controller.signal,
    });
    controller.abort();

    await expect(upload.catch(isUploadAbort)).resolves.toBe(true);
  });

  it('sends nothing when its signal has already fired', async () => {
    const controller = new AbortController();
    controller.abort();

    await putWithProgress(URL, file, { contentType: 'image/png', signal: controller.signal }).catch(
      () => undefined
    );

    expect(xhr().sent).toBe(false);
  });
});

describe('isUploadAbort', () => {
  it('is false for any other failure', () => {
    expect(isUploadAbort(new Error('The upload was refused (403).'))).toBe(false);
  });
});
