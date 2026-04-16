/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Dialog } from '@/app/components/ui/dialog';

import { RateSelectStep } from './rate-select-step';

const renderInDialog = (ui: React.ReactElement) => render(<Dialog open>{ui}</Dialog>);

describe('RateSelectStep', () => {
  const defaultProps = {
    selectedTier: null as null | 'minimum' | 'extra' | 'extraExtra',
    onTierChange: vi.fn(),
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
  };
  it('should render with heading and description', () => {
    renderInDialog(<RateSelectStep {...defaultProps} />);

    expect(screen.getByRole('heading', { name: 'Choose Your Plan' })).toBeInTheDocument();
    expect(
      screen.getByText(/Subscribe for access to all music on the Fake Four Inc\. record label\./)
    ).toBeInTheDocument();
  });

  it('should render all three tier radio options', () => {
    renderInDialog(<RateSelectStep {...defaultProps} />);

    expect(screen.getByLabelText(/Minimum/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Extra Extra/)).toBeInTheDocument();
    // "Extra" by itself (not "Extra Extra")
    expect(screen.getByLabelText(/^Extra —/)).toBeInTheDocument();
  });

  it('should display the correct prices for each tier', () => {
    renderInDialog(<RateSelectStep {...defaultProps} />);

    expect(screen.getByText(/\$14\.44\/month/)).toBeInTheDocument();
    expect(screen.getByText(/\$24\.44\/month/)).toBeInTheDocument();
    expect(screen.getByText(/\$44\.44\/month/)).toBeInTheDocument();
  });

  it('should render Cancel and Go for It buttons', () => {
    renderInDialog(<RateSelectStep {...defaultProps} />);

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Go for It/ })).toBeInTheDocument();
  });

  it('should disable Go for It button when no tier is selected', () => {
    renderInDialog(<RateSelectStep {...defaultProps} />);

    expect(screen.getByRole('button', { name: /Go for It/ })).toBeDisabled();
  });

  it('should enable Go for It button when a tier is selected', () => {
    renderInDialog(<RateSelectStep {...defaultProps} selectedTier="minimum" />);

    expect(screen.getByRole('button', { name: /Go for It/ })).toBeEnabled();
  });

  it('should call onTierChange when a tier is clicked', async () => {
    const user = userEvent.setup();

    renderInDialog(<RateSelectStep {...defaultProps} />);

    await user.click(screen.getByLabelText(/Minimum/));

    expect(defaultProps.onTierChange).toHaveBeenCalledWith('minimum');
  });

  it('should call onTierChange with extra when the extra tier is clicked', async () => {
    const user = userEvent.setup();

    renderInDialog(<RateSelectStep {...defaultProps} />);

    await user.click(screen.getByLabelText(/^Extra —/));

    expect(defaultProps.onTierChange).toHaveBeenCalledWith('extra');
  });

  it('should call onTierChange with extraExtra when that tier is clicked', async () => {
    const user = userEvent.setup();

    renderInDialog(<RateSelectStep {...defaultProps} />);

    await user.click(screen.getByLabelText(/Extra Extra/));

    expect(defaultProps.onTierChange).toHaveBeenCalledWith('extraExtra');
  });

  it('should call onCancel when Cancel button is clicked', async () => {
    const user = userEvent.setup();

    renderInDialog(<RateSelectStep {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('should call onConfirm when Go for It is clicked with a tier selected', async () => {
    const user = userEvent.setup();

    renderInDialog(<RateSelectStep {...defaultProps} selectedTier="extra" />);

    await user.click(screen.getByRole('button', { name: /Go for It/ }));

    expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('should reflect the selected tier in the radio group', () => {
    renderInDialog(<RateSelectStep {...defaultProps} selectedTier="extraExtra" />);

    const radio = screen.getByRole('radio', { name: /Extra Extra/ });
    expect(radio).toBeChecked();
  });
});
