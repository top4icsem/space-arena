import pino from 'pino';

/** JSON lines to stdout. Sync destination keeps final shutdown/fatal messages durable. */
export const logger = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
    base: { service: 'space-arena', buildSha: process.env.BUILD_SHA || 'local' },
    redact: {
      paths: [
        'password',
        'token',
        'authorization',
        'req.headers.authorization',
        'req.headers.cookie',
        'secret',
        '*.password',
        '*.token',
      ],
      censor: '[REDACTED]',
    },
  },
  pino.destination({ dest: 1, sync: true }),
);
