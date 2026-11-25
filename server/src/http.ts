import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, relative, sep, extname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { streamReplay } from './log/replay.ts';
import type { RoomManager } from './rooms.ts';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};
const RoomCreateSchema = z
  .object({
    name: z.string().regex(/^[\p{L}\p{N} ._-]{2,32}$/u),
    description: z.string().max(100).optional(),
  })
  .strict();
class HttpError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export function reply(res: ServerResponse, code: number, body: unknown): void {
  if (res.headersSent || res.destroyed) return;
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(body));
}
export async function readJsonBody(req: IncomingMessage, maxBytes = 4096): Promise<unknown> {
  let total = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const bytes: Buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.byteLength;
    if (total > maxBytes) throw new HttpError('Body too large', 413);
    chunks.push(bytes);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError('Invalid JSON body', 400);
  }
}
export function secureFilePath(root: string, rawUrl: string): string | null {
  let uri: string;
  try {
    uri = decodeURIComponent(rawUrl.split('?')[0] ?? '');
  } catch {
    return null;
  }
  if (
    uri.includes('\0') ||
    uri.includes('\\') ||
    uri.split('/').includes('..') ||
    uri.split('/').includes('.')
  )
    return null;
  const base = resolve(root);
  const file = resolve(base, `.${uri === '/' ? '/index.html' : uri}`);
  const diff = relative(base, file);
  if (diff.startsWith('..' + sep) || diff === '..' || diff.startsWith(sep)) return null;
  return file;
}
interface LogReplaySource {
  pathFor(id: string): string | null;
}
export function createHttpHandler({
  rooms,
  logs,
  distDir,
  slowDemo = false,
}: {
  rooms: RoomManager;
  logs: LogReplaySource;
  distDir: string;
  slowDemo?: boolean;
}): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    try {
      const rawPath = (req.url || '/').split('?')[0] ?? '/';
      if (rawPath === '/health' && req.method === 'GET')
        return reply(res, 200, {
          ok: true,
          uptime: Math.round(process.uptime()),
          rooms: rooms.list().length,
        });
      if (rawPath === '/api/slow' && req.method === 'GET' && slowDemo) {
        const until = performance.now() + 300;
        while (performance.now() < until) {
          /* deliberate Lab 04 event-loop stall */
        }
        return reply(res, 200, { blockedMs: 300 });
      }
      if (rawPath === '/api/rooms' && req.method === 'GET')
        return reply(res, 200, { rooms: rooms.list() });
      if (rawPath === '/api/rooms' && req.method === 'POST') {
        const parsed = RoomCreateSchema.safeParse(await readJsonBody(req));
        if (!parsed.success)
          return reply(res, 400, {
            error: 'Expected {name: 2..32 chars, description?: <=100 chars}',
          });
        let room;
        try {
          room = rooms.create({
            name: parsed.data.name.trim(),
            description: parsed.data.description || 'User-created sector',
          });
        } catch (error: unknown) {
          return reply(res, 409, {
            error: error instanceof Error ? error.message : 'Room creation failed',
          });
        }
        return reply(res, 201, { room: room.snapshot() });
      }
      if (rawPath.startsWith('/api/replays/') && req.method === 'GET') {
        const id = rawPath.slice('/api/replays/'.length);
        const file = logs.pathFor(id);
        if (!file || !(await stat(file).catch(() => null))?.isFile())
          return reply(res, 404, { error: 'Replay not found' });
        return await streamReplay(file, res);
      }
      if (rawPath.startsWith('/api/') || rawPath === '/ws')
        return reply(res, 404, { error: 'Not found' });
      if (req.method !== 'GET' && req.method !== 'HEAD')
        return reply(res, 405, { error: 'Method not allowed' });
      const file = secureFilePath(distDir, rawPath);
      if (!file) return reply(res, 403, { error: 'Forbidden path' });
      const info = await stat(file).catch(() => null);
      if (!info?.isFile()) return reply(res, 404, { error: 'Not found. Run npm run build first.' });
      res.writeHead(200, {
        'Content-Type': MIME[extname(file)] || 'application/octet-stream',
        'Content-Length': info.size,
        'Cache-Control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      await pipeline(createReadStream(file), res);
    } catch (error: unknown) {
      if (res.destroyed || res.writableEnded) return;
      if (!(error instanceof HttpError)) console.error('[HTTP]', error);
      reply(res, error instanceof HttpError ? error.status : 500, {
        error: error instanceof HttpError ? error.message : 'Internal server error',
      });
    }
  };
}
