import { resolve } from 'node:path';
import { z } from 'zod';

const environmentSchema = z
  .object({
    HOST: z.string().optional(),
    PORT: z.string().optional(),
    LOG_DIR: z.string().optional(),
    MAX_ROOMS: z.string().optional(),
    MAX_PLAYERS: z.string().optional(),
    RATE_PER_SECOND: z.string().optional(),
    MAX_MESSAGE_BYTES: z.string().optional(),
    ENABLE_SLOW_DEMO: z.string().optional(),
  })
  .passthrough();
const integerSchema = (min: number, max: number) => z.number().int().min(min).max(max);
function integer(
  name: string,
  fallback: number,
  min: number,
  max: number,
  env: Record<string, unknown>,
): number {
  const raw = env[name];
  const value = raw === undefined || raw === '' ? fallback : Number(raw);
  const result = integerSchema(min, max).safeParse(value);
  if (!result.success) throw new Error(`Invalid ${name}: expected integer ${min}..${max}`);
  return result.data;
}
export function readConfig(
  env: Record<string, string | undefined> = process.env,
  cwd = process.cwd(),
) {
  const checked = environmentSchema.safeParse(env);
  if (!checked.success) throw new Error('Invalid environment variables');
  const values = checked.data;
  const host = values.HOST || '127.0.0.1';
  if (!/^(?:localhost|[a-z0-9.:-]+)$/i.test(host)) throw new Error('Invalid HOST');
  const logDir = values.LOG_DIR || 'server/logs';
  if (logDir.includes('\0')) throw new Error('Invalid LOG_DIR');
  return Object.freeze({
    host,
    port: integer('PORT', 3000, 0, 65535, values),
    logDir: resolve(cwd, logDir),
    maxRooms: integer('MAX_ROOMS', 24, 3, 1000, values),
    maxPlayers: integer('MAX_PLAYERS', 8, 1, 32, values),
    ratePerSecond: integer('RATE_PER_SECOND', 12, 1, 100, values),
    maxMessageBytes: integer('MAX_MESSAGE_BYTES', 2048, 128, 65536, values),
    slowDemo: values.ENABLE_SLOW_DEMO === '1',
  });
}
export type ServerConfig = ReturnType<typeof readConfig>;
