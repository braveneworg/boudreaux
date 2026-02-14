'use server';

import 'server-only';

interface TurnstileVerifyResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
}

/**
 * Verifies a Cloudflare Turnstile token on the server side.
 * @param token - The token received from the Turnstile widget
 * @param ip - Optional IP address of the client for additional validation
 * @returns Object with success status and optional error message
 */
export const verifyTurnstile = async (
  token: string,
  ip?: string
): Promise<{ success: boolean; error?: string }> => {
  const secret = process.env.CLOUDFLARE_SECRET;

  if (!secret) {
    console.error('CLOUDFLARE_SECRET environment variable is not set');
    return { success: false, error: 'Server configuration error' };
  }

  if (!token) {
    return { success: false, error: 'Turnstile token is required' };
  }

  // Cloudflare's well-known test secret key — skip the API call during testing
  // @see https://developers.cloudflare.com/turnstile/troubleshooting/testing/
  // Only bypass when BOTH conditions are met:
  // 1. Using Cloudflare's test secret key
  // 2. E2E_MODE is explicitly enabled
  // This prevents accidental bypass in production if test secret is misconfigured
  if (secret === '1x0000000000000000000000000000000AA' && process.env.E2E_MODE === 'true') {
    return { success: true };
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', secret);
    formData.append('response', token);
    if (ip) {
      formData.append('remoteip', ip);
    }

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      console.error('Turnstile verification request failed:', response.status);
      return { success: false, error: 'Verification service unavailable' };
    }

    const result: TurnstileVerifyResponse = await response.json();

    if (!result.success) {
      const errorCodes = result['error-codes'] || [];
      console.error('Turnstile verification failed:', errorCodes);
      return {
        success: false,
        error: errorCodes.includes('invalid-input-response')
          ? 'Invalid verification. Please try again.'
          : 'Verification failed. Please refresh and try again.',
      };
    }

    return { success: true };
  } catch (error) {
    console.error('Turnstile verification error:', error);
    return { success: false, error: 'Verification service error' };
  }
};
