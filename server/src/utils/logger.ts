type Level = 'info' | 'warn' | 'error' | 'debug';

function ts() {
  return new Date().toISOString();
}

function line(level: Level, msg: string, meta?: unknown) {
  const base = `[${ts()}] [${level.toUpperCase()}] ${msg}`;
  if (meta !== undefined) {
    // eslint-disable-next-line no-console
    console.log(base, meta);
  } else {
    // eslint-disable-next-line no-console
    console.log(base);
  }
}

export const logger = {
  info: (msg: string, meta?: unknown) => line('info', msg, meta),
  warn: (msg: string, meta?: unknown) => line('warn', msg, meta),
  error: (msg: string, meta?: unknown) => line('error', msg, meta),
  debug: (msg: string, meta?: unknown) => {
    if (process.env.MULTICRAFT_DEBUG) line('debug', msg, meta);
  },
};
