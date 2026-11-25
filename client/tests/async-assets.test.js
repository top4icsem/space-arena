import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchJson,
  fetchResponse,
  loadAll,
  withRetry,
  HttpError,
  delay,
} from '../src/assets/loader.js';

function reply(body, { status = 200, type = 'application/json' } = {}) {
  return new Response(body, { status, headers: { 'content-type': type } });
}

test('fetchJson validates HTTP ok and rejects 404 without retrying', async () => {
  let attempts = 0;
  const fetchImpl = async () => {
    attempts++;
    return reply('missing', { status: 404 });
  };
  await assert.rejects(
    fetchJson('/lost', { fetchImpl, baseDelayMs: 0 }),
    (e) => e instanceof HttpError && e.status === 404,
  );
  assert.equal(attempts, 1);
});

test('withRetry backs off on transient HTTP 503 then fulfills', async () => {
  let attempts = 0;
  const value = await withRetry(
    async () => {
      attempts++;
      if (attempts < 3) throw new HttpError(503, '/api/test');
      return 'ok';
    },
    { baseDelayMs: 0, attempts: 3, random: () => 0 },
  );
  assert.equal(value, 'ok');
  assert.equal(attempts, 3);
});

test('bad JSON rejects with SyntaxError and is not swallowed', async () => {
  await assert.rejects(
    fetchJson('/invalid', { fetchImpl: async () => reply('{bad') }),
    SyntaxError,
  );
});

test('loadAll starts all file promises concurrently and tracks each settlement', async () => {
  const started = [];
  const waiting = [];
  const progress = [];
  const manifest = {
    assets: [
      { id: 'arena', type: 'json', url: '/arena' },
      { id: 'settings', type: 'json', url: '/settings' },
      { id: 'rooms', type: 'json', url: '/rooms' },
    ],
  };
  const fetchImpl = (url) => {
    started.push(url);
    return new Promise((resolve) => waiting.push(() => resolve(reply(JSON.stringify({ url })))));
  };
  const all = loadAll(manifest, { fetchImpl, onProgress: (point) => progress.push(point) });
  await Promise.resolve();
  assert.deepEqual(started, ['/arena', '/settings', '/rooms']);
  for (const finish of waiting) finish();
  const result = await all;
  assert.equal(result.json.rooms.url, '/rooms');
  assert.deepEqual(
    progress.map((point) => point.completed),
    [0, 1, 2, 3],
  );
  assert.equal(progress.at(-1).fraction, 1);
});

test('abort cancels retry delays immediately', async () => {
  const controller = new AbortController();
  const task = withRetry(
    () => {
      throw new Error('offline');
    },
    {
      signal: controller.signal,
      attempts: 5,
      baseDelayMs: 4000,
    },
  );
  controller.abort();
  await assert.rejects(task, (error) => error.name === 'AbortError');
});

test('delay supports an external AbortSignal', async () => {
  const controller = new AbortController();
  const task = delay(8000, controller.signal);
  controller.abort();
  await assert.rejects(task, (e) => e.name === 'AbortError');
});

test('fetchResponse timeout does not hang forever', async () => {
  let attempts = 0;
  const hanging = (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      attempts++;
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  const keepAlive = setTimeout(() => {}, 200); // Node's AbortSignal.timeout is unref'd.
  try {
    await assert.rejects(
      fetchResponse('/slow', { fetchImpl: hanging, attempts: 2, timeoutMs: 12, baseDelayMs: 0 }),
      (e) => e.name === 'TimeoutError',
    );
  } finally {
    clearTimeout(keepAlive);
  }
  assert.equal(attempts, 2);
});
