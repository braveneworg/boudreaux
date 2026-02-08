import { CONSTANTS } from '../constants';

export enum LogMethods {
  Info = 'info',
  Warn = 'warn',
  Error = 'error',
}

export const log = (...args: unknown[]) => {
  if (process.env.NODE_ENV === CONSTANTS.ENV.DEVELOPMENT) {
    const possibleMethod = args[0];
    // Check if the first argument is one of the LogMethods enum values
    const isLogMethod =
      possibleMethod === LogMethods.Info ||
      possibleMethod === LogMethods.Warn ||
      possibleMethod === LogMethods.Error;
    // Be sure to remove the first argument if it's a log method
    const method: LogMethods = isLogMethod ? (args.shift() as LogMethods) : LogMethods.Info;

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
