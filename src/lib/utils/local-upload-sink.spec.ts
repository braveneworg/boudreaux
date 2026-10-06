/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { LOCAL_UPLOAD_SINK_PATH, localSinkKey } from './local-upload-sink';

describe('localSinkKey', () => {
  const key = 'media/videos/abc123/poster.jpg';
  const sinkUrl = `http://127.0.0.1:3099${LOCAL_UPLOAD_SINK_PATH}?key=${encodeURIComponent(key)}`;

  it('reads the key from a sink URL when the server runs in E2E mode', () => {
    vi.stubEnv('E2E_MODE', 'true');
    expect(localSinkKey(sinkUrl)).toBe(key);
  });

  it('reads the key from a sink URL when the browser runs in E2E mode', () => {
    vi.stubEnv('E2E_MODE', '');
    vi.stubEnv('NEXT_PUBLIC_E2E_MODE', 'true');
    expect(localSinkKey(sinkUrl)).toBe(key);
  });

  it('ignores any other path', () => {
    vi.stubEnv('E2E_MODE', 'true');
    expect(localSinkKey(`http://127.0.0.1:3099/${key}`)).toBeNull();
  });

  it('ignores a value that is not a URL', () => {
    vi.stubEnv('E2E_MODE', 'true');
    expect(localSinkKey('media/videos/abc123/poster.jpg')).toBeNull();
  });

  it('ignores sink URLs outside E2E mode', () => {
    vi.stubEnv('E2E_MODE', '');
    vi.stubEnv('NEXT_PUBLIC_E2E_MODE', '');
    expect(localSinkKey(sinkUrl)).toBeNull();
  });
});
