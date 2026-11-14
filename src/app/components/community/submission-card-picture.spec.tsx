/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { SubmissionCardPicture } from './submission-card-picture';

const CARD = 'https://cdn.example/media/submissions/s/a/card.webp';

describe('SubmissionCardPicture', () => {
  it('shows the card picture, as the one file the re-encode wrote', () => {
    render(<SubmissionCardPicture url={CARD} category="PHOTO" />);

    expect(screen.getByRole('presentation')).toHaveAttribute('src', CARD);
  });

  it('is decoration: the title beside it already names the submission', () => {
    render(<SubmissionCardPicture url={CARD} category="PHOTO" />);

    expect(screen.getByRole('presentation')).toHaveAttribute('alt', '');
  });

  it('shows a tile naming the category when there is no picture', () => {
    render(<SubmissionCardPicture url={undefined} category="ORIGINAL_SONG" />);

    expect(screen.getByText('Original song')).toBeInTheDocument();
    expect(screen.queryByRole('presentation')).not.toBeInTheDocument();
  });
});
