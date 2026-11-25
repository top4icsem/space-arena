import { resolve } from 'node:path';

function integer(name, fallback, min, max, env) {
  const value = env[name] === undefined || env[name] === '' ? fallback : Number(env[name]);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`Invalid ${name}: expected integer ${min}..${max}`);
  }
  return value;
}
export function readConfig(env = process.env, cwd = process.cwd()) {
  const host = env.HOST || '127.0.0.1';
  if (!/^(?:localhost|[a-z0-9.:-]+)$/i.test(host)) throw new Error('Invalid HOST');
  const logDir = env.LOG_DIR || 'server/logs';
  if (logDir.includes('\0')) throw new Error('Invalid LOG_DIR');
  return Object.freeze({
    host,
    port: integer('PORT', 3000, 0, 65535, env),
    logDir: resolve(cwd, logDir),
    maxRooms: integer('MAX_ROOMS', 24, 3, 1000, env),
    maxPlayers: integer('MAX_PLAYERS', 8, 1, 32, env),
    ratePerSecond: integer('RATE_PER_SECOND', 12, 1, 100, env),
    maxMessageBytes: integer('MAX_MESSAGE_BYTES', 2048, 128, 65536, env),
    slowDemo: env.ENABLE_SLOW_DEMO === '1',
  });
}
