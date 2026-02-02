import { render, screen } from '@testing-library/react';

import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from './input-otp';

describe('InputOTP', () => {
  it('renders', () => {
    render(
      <InputOTP maxLength={6}>
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
          <InputOTPSlot index={2} />
        </InputOTPGroup>
      </InputOTP>
    );

    expect(document.querySelector('[data-slot="input-otp"]')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <InputOTP maxLength={6} className="custom-otp">
        <InputOTPGroup>
          <InputOTPSlot index={0} />
        </InputOTPGroup>
      </InputOTP>
    );

    expect(document.querySelector('[data-slot="input-otp"]')).toHaveClass('custom-otp');
  });

  it('applies custom containerClassName', () => {
    render(
      <InputOTP maxLength={6} containerClassName="custom-container">
        <InputOTPGroup>
          <InputOTPSlot index={0} />
        </InputOTPGroup>
      </InputOTP>
    );

    // Container is the outer div
    const container = document
      .querySelector('[data-slot="input-otp"]')
      ?.closest('[class*="custom-container"]');
    expect(container).toBeInTheDocument();
  });
});

describe('InputOTPGroup', () => {
  it('renders', () => {
    render(
      <InputOTP maxLength={6}>
        <InputOTPGroup>
          <InputOTPSlot index={0} />
        </InputOTPGroup>
      </InputOTP>
    );

    expect(document.querySelector('[data-slot="input-otp-group"]')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <InputOTP maxLength={6}>
        <InputOTPGroup className="custom-group">
          <InputOTPSlot index={0} />
        </InputOTPGroup>
      </InputOTP>
    );

    expect(document.querySelector('[data-slot="input-otp-group"]')).toHaveClass('custom-group');
  });

  it('has flex layout', () => {
    render(
      <InputOTP maxLength={6}>
        <InputOTPGroup>
          <InputOTPSlot index={0} />
        </InputOTPGroup>
      </InputOTP>
    );

    expect(document.querySelector('[data-slot="input-otp-group"]')).toHaveClass('flex');
  });
});

describe('InputOTPSlot', () => {
  it('renders', () => {
    render(
      <InputOTP maxLength={6}>
        <InputOTPGroup>
          <InputOTPSlot index={0} />
        </InputOTPGroup>
      </InputOTP>
    );

    expect(document.querySelector('[data-slot="input-otp-slot"]')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <InputOTP maxLength={6}>
        <InputOTPGroup>
          <InputOTPSlot index={0} className="custom-slot" />
        </InputOTPGroup>
      </InputOTP>
    );

    expect(document.querySelector('[data-slot="input-otp-slot"]')).toHaveClass('custom-slot');
  });

  it('renders multiple slots', () => {
    render(
      <InputOTP maxLength={6}>
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
          <InputOTPSlot index={2} />
        </InputOTPGroup>
      </InputOTP>
    );

    expect(document.querySelectorAll('[data-slot="input-otp-slot"]')).toHaveLength(3);
  });
});

describe('InputOTPSeparator', () => {
  it('renders', () => {
    render(
      <InputOTP maxLength={6}>
        <InputOTPGroup>
          <InputOTPSlot index={0} />
        </InputOTPGroup>
        <InputOTPSeparator />
        <InputOTPGroup>
          <InputOTPSlot index={1} />
        </InputOTPGroup>
      </InputOTP>
    );

    expect(document.querySelector('[data-slot="input-otp-separator"]')).toBeInTheDocument();
  });

  it('has separator role', () => {
    render(
      <InputOTP maxLength={6}>
        <InputOTPGroup>
          <InputOTPSlot index={0} />
        </InputOTPGroup>
        <InputOTPSeparator />
        <InputOTPGroup>
          <InputOTPSlot index={1} />
        </InputOTPGroup>
      </InputOTP>
    );

    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  it('contains minus icon', () => {
    render(
      <InputOTP maxLength={6}>
        <InputOTPGroup>
          <InputOTPSlot index={0} />
        </InputOTPGroup>
        <InputOTPSeparator />
        <InputOTPGroup>
          <InputOTPSlot index={1} />
        </InputOTPGroup>
      </InputOTP>
    );

    expect(document.querySelector('svg')).toBeInTheDocument();
  });
});

describe('Full InputOTP Integration', () => {
  it('renders a complete OTP input with separator', () => {
    render(
      <InputOTP maxLength={6}>
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
          <InputOTPSlot index={2} />
        </InputOTPGroup>
        <InputOTPSeparator />
        <InputOTPGroup>
          <InputOTPSlot index={3} />
          <InputOTPSlot index={4} />
          <InputOTPSlot index={5} />
        </InputOTPGroup>
      </InputOTP>
    );

    expect(document.querySelectorAll('[data-slot="input-otp-group"]')).toHaveLength(2);
    expect(document.querySelectorAll('[data-slot="input-otp-slot"]')).toHaveLength(6);
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });
});
