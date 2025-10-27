import { CONSTANTS } from '../constants';

export enum LogMethods {
  Info = 'info',
  Warn = 'warn',
  Error = 'error',
}

export const log = (...args: unknown[]) => {
  if (process.env.NODE_ENV === CONSTANTS.ENV.DEVELOPMENT) {
    const possibleMethod = args[0];
    const isLogMethod = typeof possibleMethod === typeof LogMethods;
    // Be sure to remove the first argument if it's a log method
    const method: LogMethods = isLogMethod ? (args.shift() as LogMethods) : LogMethods.Info;
    // eslint-disable-next-line no-console
    console[method](...args);
  }
};

export const warn = (...args: unknown[]) => {
  log(LogMethods.Warn, ...args);
};

export const error = (...args: unknown[]) => {
  log(LogMethods.Error, ...args);
};
