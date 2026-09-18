/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';

import { FaceBadge, LicenseBadge } from './bio-image-badges';

describe('LicenseBadge', () => {
  it('renders the license badge as a link when a licenseUrl is present', () => {
    render(
      <LicenseBadge
        license="CC BY-SA 4.0"
        licenseUrl="https://creativecommons.org/licenses/by-sa/4.0/"
      />
    );
    const link = screen.getByRole('link', { name: /CC BY-SA 4\.0/ });
    expect(link).toHaveAttribute('href', 'https://creativecommons.org/licenses/by-sa/4.0/');
  });

  it('opens the license link in a new tab safely', () => {
    render(
      <LicenseBadge
        license="CC BY-SA 4.0"
        licenseUrl="https://creativecommons.org/licenses/by-sa/4.0/"
      />
    );
    const link = screen.getByRole('link', { name: /CC BY-SA 4\.0/ });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders a plain license badge (no link) when only the license name is present', () => {
    render(<LicenseBadge license="Public domain" licenseUrl={null} />);
    expect(screen.getByText('Public domain')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders "Rights unknown" when neither license nor licenseUrl is present', () => {
    render(<LicenseBadge license={null} licenseUrl={null} />);
    expect(screen.getByText('Rights unknown')).toBeInTheDocument();
  });

  it('does not render "Rights unknown" when a license name is present', () => {
    render(<LicenseBadge license="Public domain" licenseUrl={null} />);
    expect(screen.queryByText('Rights unknown')).not.toBeInTheDocument();
  });
});

describe('FaceBadge', () => {
  it('renders a "Face NN%" badge when a faceScore is present', () => {
    render(<FaceBadge hasFace faceScore={88} />);
    expect(screen.getByText('Face 88%')).toBeInTheDocument();
  });

  it('rounds the faceScore to the nearest whole percent', () => {
    render(<FaceBadge hasFace faceScore={97.4} />);
    expect(screen.getByText('Face 97%')).toBeInTheDocument();
  });

  it('exposes an accessible face-match label with the rounded percent', () => {
    render(<FaceBadge hasFace faceScore={97.4} />);
    expect(screen.getByLabelText('Face match 97%')).toBeInTheDocument();
  });

  it('renders a bare "Face" badge when hasFace is true but the score is null', () => {
    render(<FaceBadge hasFace faceScore={null} />);
    expect(screen.getByText('Face', { exact: true })).toBeInTheDocument();
  });

  it('renders no face badge when hasFace is false', () => {
    const { container } = render(<FaceBadge hasFace={false} faceScore={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders no face badge when the face signal is absent (null)', () => {
    const { container } = render(<FaceBadge hasFace={null} faceScore={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders no face badge when the face signal is undefined', () => {
    const { container } = render(<FaceBadge hasFace={undefined} faceScore={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
