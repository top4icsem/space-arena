import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { pipeline } from 'node:stream/promises';

/** Async generator for server-side review, without readFile on huge logs. */
export async function* replayEvents(file) {
  const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of lines) if (line.trim()) yield JSON.parse(line);
}

/** Backpressure from a slow res pauses file reads automatically. */
export async function streamReplay(file, res) {
  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  await pipeline(createReadStream(file), res);
}
