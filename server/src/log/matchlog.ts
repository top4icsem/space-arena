import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { PassThrough, Transform } from 'node:stream';
import type { TransformCallback } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';
import type { Room, RoomEvent } from '../rooms.ts';

export class JsonLinesTransform extends Transform {
  constructor() {
    super({ writableObjectMode: true });
  }
  _transform(event: unknown, _encoding: BufferEncoding, done: TransformCallback): void {
    try {
      done(null, `${JSON.stringify(event)}\n`);
    } catch (error: unknown) {
      done(error instanceof Error ? error : new Error('Cannot serialize event'));
    }
  }
}
interface ActiveLog {
  id: string;
  file: string;
  room: Room;
  source: PassThrough;
  task: Promise<void>;
  pending: RoomEvent[];
  closing: boolean;
  closePromise?: Promise<void>;
  feed: (event: RoomEvent) => void;
  drain: () => void;
}
export class MatchLogStore {
  readonly logDir: string;
  readonly active = new Map<string, ActiveLog>();
  readonly completed = new Map<string, string>();
  constructor(logDir: string) {
    this.logDir = logDir;
  }
  async attach(room: Room): Promise<string> {
    await mkdir(this.logDir, { recursive: true });
    const id = `${room.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const file = join(this.logDir, `${id}.ndjson`);
    const source = new PassThrough({ objectMode: true, highWaterMark: 32 });
    const task = pipeline(source, new JsonLinesTransform(), createWriteStream(file));
    const entry: ActiveLog = {
      id,
      file,
      room,
      source,
      task,
      pending: [],
      closing: false,
      feed: () => {},
      drain: () => {},
    };
    this.active.set(room.id, entry);
    this.completed.set(id, file);
    const feed = (event: RoomEvent) => {
      if (entry.closing) return;
      if (!source.write(event)) room.logBackpressured = true;
    };
    const drain = () => {
      room.logBackpressured = false;
    };
    source.on('drain', drain);
    source.on('error', (error: Error) => room.emit('error', error));
    void task
      .catch((error: unknown) => room.emit('error', error))
      .finally(() => {
        room.logBackpressured = false;
      });
    entry.feed = feed;
    entry.drain = drain;
    room.onGameEvent(feed);
    room.on('empty', () => {
      void this.close(room.id);
    });
    return id;
  }
  async close(roomId: string): Promise<void> {
    const entry = this.active.get(roomId);
    if (!entry) return;
    if (entry.closePromise) return entry.closePromise;
    entry.closing = true;
    entry.room.offGameEvent(entry.feed);
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
  async closeAll(): Promise<void> {
    await Promise.allSettled([...this.active.keys()].map((id) => this.close(id)));
  }
  pathFor(id: string): string | null {
    return /^[a-z0-9-]{1,90}$/.test(id) ? join(this.logDir, `${id}.ndjson`) : null;
  }
}
