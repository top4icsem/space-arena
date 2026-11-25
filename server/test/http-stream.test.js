import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { RoomManager } from '../src/rooms.ts';
import { JsonLinesTransform, MatchLogStore } from '../src/log/matchlog.ts';
import { replayEvents } from '../src/log/replay.ts';
import { createHttpHandler, secureFilePath } from '../src/http.ts';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

test('Static path guard rejects encoded traversal (including backslash)', () => {
  assert.equal(secureFilePath('/tmp/public', '/../secret.txt'), null);
  assert.equal(secureFilePath('/tmp/public', '/%2e%2e/secret.txt'), null);
  assert.equal(secureFilePath('/tmp/public', '/..%5csecret.txt'), null);
  assert.equal(secureFilePath('/tmp/public', '/ok.json'), '/tmp/public/ok.json');
});
test('NDJSON Transform + pipeline roundtrips structured events', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'arena-transform-'));
  try {
    const file = join(dir, 'sample.ndjson');
    const { createWriteStream } = await import('node:fs');
    await pipeline(
      Readable.from([
        { t: 1, type: 'join' },
        { t: 2, type: 'chat', text: 'hi' },
      ]),
      new JsonLinesTransform(),
      createWriteStream(file),
    );
    const parsed = [];
    for await (const event of replayEvents(file)) parsed.push(event);
    assert.deepEqual(
      parsed.map((e) => e.type),
      ['join', 'chat'],
    );
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});
test('HTTP API health/rooms/create, built client and stream replay', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'arena-http-'));
  const logDir = join(dir, 'logs');
  const distDir = join(dir, 'dist');
  const { mkdir } = await import('node:fs/promises');
  await mkdir(distDir);
  await writeFile(join(distDir, 'index.html'), '<h1>Space Arena</h1>');
  const logs = new MatchLogStore(logDir);
  const manager = new RoomManager({
    seed: false,
    maxRooms: 3,
    onRoom: (room) => {
      void logs.attach(room);
    },
  });
  const server = createServer(createHttpHandler({ rooms: manager, logs, distDir }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(url + '/health')).status, 200);
    assert.deepEqual((await (await fetch(url + '/api/rooms')).json()).rooms, []);
    const created = await fetch(url + '/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test room' }),
    });
    assert.equal(created.status, 201);
    const body = await created.json();
    assert.equal(body.room.name, 'Test room');
    assert.equal((await (await fetch(url + '/')).text()).includes('Space Arena'), true);
    // fetch() normalizes dot segments before sending, so traversal is unit-tested above.
    assert.equal((await fetch(url + '/api/rooms', { method: 'POST', body: '{' })).status, 400);
    const room = manager.get(body.room.id);
    // Log writer creation is asynchronous; wait until its file is registered.
    const waitUntil = Date.now() + 2000;
    while (!logs.active.has(room.id) && Date.now() < waitUntil)
      await new Promise((r) => setTimeout(r, 5));
    assert.ok(logs.active.has(room.id));
    room.join({ id: 'p', name: 'Pilot' });
    room.chat({ id: 'p' }, 'Hi');
    const id = logs.active.get(room.id).id;
    room.leave('p');
    await logs.closeAll();
    assert.equal((await readFile(logs.pathFor(id), 'utf8')).includes('"chat"'), true);
    const replay = await fetch(`${url}/api/replays/${id}`);
    assert.equal(replay.status, 200);
    assert.match(await replay.text(), /"chat"/);
  } finally {
    await logs.closeAll();
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
