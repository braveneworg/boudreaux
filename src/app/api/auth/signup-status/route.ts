/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextResponse } from 'next/server';

import { SignupSettingsService } from '@/lib/services/signup-settings-service';

export const GET = async (): Promise<NextResponse> => {
  try {
    return NextResponse.json({ paused: await SignupSettingsService.areSignupsPaused() });
  } catch {
    return NextResponse.json({ paused: false });
  }
};
