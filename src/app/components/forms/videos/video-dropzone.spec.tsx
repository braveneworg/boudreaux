/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';

import { VideoDropzone } from './video-dropzone';

const props = { label: 'Choose a video file', hint: 'MP4 or WebM', onFile: vi.fn() };

// The E2E specs pick a file only once this marker reads "true": a change
// event fired before React attaches the input's handler is lost (the file
// never uploads). renderToString never hydrates, so it stands in for the
// server markup here.
describe('VideoDropzone hydration marker', () => {
  it('reads false in the server markup', () => {
    expect(renderToString(<VideoDropzone {...props} />)).toContain('data-hydrated="false"');
  });

  it('reads true once the component runs in the browser', () => {
    render(<VideoDropzone {...props} />);

    expect(screen.getByTestId('video-dropzone')).toHaveAttribute('data-hydrated', 'true');
  });
});
