/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CONSTANTS } from '@/lib/constants';

export const LogMethods = {
  Info: 'info',
  Warn: 'warn',
  Error: 'error',
} as const;

export type LogMethod = (typeof LogMethods)[keyof typeof LogMethods];

export const log = (...args: unknown[]) => {
  if (process.env.NODE_ENV === CONSTANTS.ENV.DEVELOPMENT) {
    const possibleMethod = args[0];
    // Check if the first argument is one of the LogMethods values
    const isLogMethod =
      possibleMethod === LogMethods.Info ||
      possibleMethod === LogMethods.Warn ||
      possibleMethod === LogMethods.Error;
    // Be sure to remove the first argument if it's a log method
    const method: LogMethod = isLogMethod ? (args.shift() as LogMethod) : LogMethods.Info;

    if (method === LogMethods.Warn) {
      console.warn(...args);
    } else if (method === LogMethods.Error) {
      console.error(...args);
    } else {
      console.info(...args);
    }
  }
};

export const warn = (...args: unknown[]) => {
  log(LogMethods.Warn, ...args);
};

export const error = (...args: unknown[]) => {
  log(LogMethods.Error, ...args);
};
