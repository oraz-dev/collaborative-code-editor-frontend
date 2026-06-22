type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const ENABLED = import.meta.env.DEV;

function log(level: LogLevel, message: string, ...args: unknown[]): void {
  if (!ENABLED && level === 'debug') return;
  console[level](
    `%c[${level.toUpperCase()}]`,
    `color: ${level === 'error' ? '#ef4444' : level === 'warn' ? '#f59e0b' : level === 'info' ? '#3b82f6' : '#6b7280'}`,
    message,
    ...args,
  );
}

export const logger = {
  debug: (message: string, ...args: unknown[]) => log('debug', message, ...args),
  info: (message: string, ...args: unknown[]) => log('info', message, ...args),
  warn: (message: string, ...args: unknown[]) => log('warn', message, ...args),
  error: (message: string, ...args: unknown[]) => log('error', message, ...args),
};
