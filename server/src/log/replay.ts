import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { pipeline } from 'node:stream/promises';
import type { ServerResponse } from 'node:http';

/** Async generator for reviewing very large NDJSON without reading it all into memory. */
export async function* replayEvents(file: string): AsyncGenerator<unknown, void, unknown> {
  const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of lines) if (line.trim()) yield JSON.parse(line);
}
/** Pipeline propagates response backpressure to the file reader. */
export async function streamReplay(file: string, res: ServerResponse): Promise<void> {
  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  await pipeline(createReadStream(file), res);
}
