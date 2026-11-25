import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, relative, sep, extname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { streamReplay } from './log/replay.js';

const MIME = {
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
export function reply(res, code, body) {
  if (res.headersSent || res.destroyed) return;
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(body));
}
export async function readJsonBody(req, maxBytes = 4096) {
  let total = 0;
  const chunks = [];
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      const err = new Error('Body too large');
      err.status = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  let value;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const err = new Error('Invalid JSON body');
    err.status = 400;
    throw err;
  }
  return value;
}
export function secureFilePath(root, rawUrl) {
  let uri;
  try {
    uri = decodeURIComponent(rawUrl.split('?')[0]);
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
export function createHttpHandler({ rooms, logs, distDir, slowDemo = false }) {
  return async (req, res) => {
    try {
      const rawPath = (req.url || '/').split('?')[0];
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
        const data = await readJsonBody(req);
        if (
          !data ||
          typeof data !== 'object' ||
          Array.isArray(data) ||
          typeof data.name !== 'string' ||
          !/^[\p{L}\p{N} ._-]{2,32}$/u.test(data.name) ||
          (data.description !== undefined &&
            (typeof data.description !== 'string' || data.description.length > 100)) ||
          Object.keys(data).some((key) => !['name', 'description'].includes(key))
        ) {
          return reply(res, 400, {
            error: 'Expected {name: 2..32 chars, description?: <=100 chars}',
          });
        }
        let room;
        try {
          room = rooms.create({
            name: data.name.trim(),
            description: data.description || 'User-created sector',
          });
        } catch (error) {
          return reply(res, 409, { error: error.message });
        }
        return reply(res, 201, { room: room.snapshot() });
      }
      if (rawPath.startsWith('/api/replays/') && req.method === 'GET') {
        const id = rawPath.slice('/api/replays/'.length);
        const file = logs.pathFor(id);
        if (!file || !(await stat(file).catch(() => null))?.isFile())
          return reply(res, 404, { error: 'Replay not found' });
        // File can be replayed after a server restart; no whole-file buffering.
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
      if (req.method === 'HEAD') return res.end();
      await pipeline(createReadStream(file), res);
    } catch (error) {
      if (res.destroyed || res.writableEnded) return;
      if (!error.status) console.error('[HTTP]', error);
      reply(res, error.status || 500, {
        error: error.status ? error.message : 'Internal server error',
      });
    }
  };
}
