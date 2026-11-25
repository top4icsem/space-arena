import { resolve } from 'node:path';
import { z } from 'zod';

const environmentSchema = z
  .object({
    NODE_ENV: z.string().optional(),
    HOST: z.string().optional(),
    PORT: z.string().optional(),
    LOG_DIR: z.string().optional(),
    MAX_ROOMS: z.string().optional(),
    MAX_PLAYERS: z.string().optional(),
    RATE_PER_SECOND: z.string().optional(),
    MAX_MESSAGE_BYTES: z.string().optional(),
    ENABLE_SLOW_DEMO: z.string().optional(),
    ALLOWED_ORIGINS: z.string().optional(),
    MAX_CONNECTIONS_PER_IP: z.string().optional(),
    BUILD_SHA: z.string().optional(),
    BUILD_TAG: z.string().optional(),
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
  const number = raw === undefined || raw === '' ? fallback : Number(raw);
  const result = integerSchema(min, max).safeParse(number);
  if (!result.success) throw new Error(`Invalid ${name}: expected integer ${min}..${max}`);
  return result.data;
}
function origins(raw: string | undefined): readonly string[] {
  if (!raw) return [];
  const set = new Set<string>();
  for (const candidate of raw.split(',').map((part) => part.trim())) {
    if (!candidate) throw new Error('Empty entry in ALLOWED_ORIGINS');
    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      throw new Error(`Invalid ALLOWED_ORIGINS entry: ${candidate}`);
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.href !== `${url.origin}/` ||
      candidate !== url.origin
    )
      throw new Error(`ALLOWED_ORIGINS needs an exact http(s) origin: ${candidate}`);
    set.add(candidate);
  }
  return [...set];
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
  const allowedOrigins = origins(values.ALLOWED_ORIGINS);
  if (values.NODE_ENV === 'production' && !allowedOrigins.length)
    throw new Error('ALLOWED_ORIGINS is required in production (exact https:// URL origin)');
  const sha = values.BUILD_SHA || 'local';
  if (!/^(?:local|[a-fA-F0-9]{7,40})$/.test(sha)) throw new Error('Invalid BUILD_SHA');
  const tag = values.BUILD_TAG || 'development';
  if (!/^[a-zA-Z0-9._-]{1,60}$/.test(tag)) throw new Error('Invalid BUILD_TAG');
  return Object.freeze({
    host,
    port: integer('PORT', 3000, 0, 65535, values),
    logDir: resolve(cwd, logDir),
    maxRooms: integer('MAX_ROOMS', 24, 3, 1000, values),
    maxPlayers: integer('MAX_PLAYERS', 8, 1, 32, values),
    ratePerSecond: integer('RATE_PER_SECOND', 12, 1, 100, values),
    maxMessageBytes: integer('MAX_MESSAGE_BYTES', 2048, 128, 65536, values),
    slowDemo: values.ENABLE_SLOW_DEMO === '1',
    allowedOrigins,
    maxConnectionsPerIp: integer('MAX_CONNECTIONS_PER_IP', 8, 1, 100, values),
    buildSha: sha,
    buildTag: tag,
  });
}
export type ServerConfig = ReturnType<typeof readConfig>;
