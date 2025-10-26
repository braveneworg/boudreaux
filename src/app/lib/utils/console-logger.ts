export enum LogMethods {
  Info = 'info',
  Warn = 'warn',
  Error = 'error',
}

const DEVELOPMENT = 'development';

type Environment = {
  readonly development: typeof DEVELOPMENT;
};

const ENVIRONMENT = {
  development: DEVELOPMENT,
} as const satisfies Environment;

export const log = (...args: unknown[]) => {
  if (process.env.NODE_ENV === ENVIRONMENT.development) {
    const possibleMethod = args[0];
    const isLogMethod = Object.values(LogMethods).includes(possibleMethod as LogMethods);
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
