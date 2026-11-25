import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { PassThrough, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';

export class JsonLinesTransform extends Transform {
  constructor() {
    super({ writableObjectMode: true });
  }
  _transform(event, _encoding, done) {
    try {
      done(null, `${JSON.stringify(event)}\n`);
    } catch (error) {
      done(error);
    }
  }
}
export class MatchLogStore {
  constructor(logDir) {
    this.logDir = logDir;
    this.active = new Map();
    this.completed = new Map();
  }
  async attach(room) {
    await mkdir(this.logDir, { recursive: true });
    const id = `${room.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const file = join(this.logDir, `${id}.ndjson`);
    const source = new PassThrough({ objectMode: true, highWaterMark: 32 });
    // pipeline propagates backpressure and owns stream cleanup.
    const task = pipeline(source, new JsonLinesTransform(), createWriteStream(file));
    const entry = { id, file, room, source, task, pending: [], closing: false };
    this.active.set(room.id, entry);
    this.completed.set(id, file);
    const feed = (event) => {
      if (entry.closing) return;
      if (!source.write(event)) {
        // For chat logs, never lose data: retain a bounded queue and stop
        // accepting unbounded input by causing the room to reject new chats.
        room.logBackpressured = true;
      }
    };
    const drain = () => {
      room.logBackpressured = false;
    };
    source.on('drain', drain);
    source.on('error', (error) => room.emit('error', error));
    task
      .catch((error) => room.emit('error', error))
      .finally(() => {
        room.logBackpressured = false;
      });
    entry.feed = feed;
    entry.drain = drain;
    room.on('event', feed);
    room.on('empty', () => {
      void this.close(room.id);
    });
    return id;
  }
  async close(roomId) {
    const entry = this.active.get(roomId);
    if (!entry) return;

    if (entry.closePromise) {
      await entry.closePromise;
      return;
    }

    entry.closing = true;
    entry.room.off('event', entry.feed);

    entry.closePromise = (async () => {
      entry.source.end();
      await entry.task;
    })();

    try {
      await entry.closePromise;
    } finally {
      this.active.delete(roomId);
    }
  }
  async closeAll() {
    await Promise.allSettled([...this.active.keys()].map((id) => this.close(id)));
  }
  pathFor(id) {
    // Never accept path components supplied by callers.
    return /^[a-z0-9-]{1,90}$/.test(id) ? join(this.logDir, `${id}.ndjson`) : null;
  }
}
