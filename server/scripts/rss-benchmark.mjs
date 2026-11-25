import { createServer, get } from 'node:http';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { writeFile, mkdir } from 'node:fs/promises';
import { streamReplay } from '../src/log/replay.ts';

const input = Object.fromEntries(
  process.argv.slice(2).map((arg) => arg.replace(/^--/, '').split('=')),
);
const sizeMb = Math.max(1, Math.min(300, Number(input.mb) || 200));
const pauseMs = Math.max(0, Math.min(250, Number(input.pause) || 65));
const outputDir = resolve(input.out || 'docs');
const dir = await mkdtemp(join(tmpdir(), 'arena-bench-'));
const file = join(dir, 'synthetic.ndjson');
const target = sizeMb * 1024 * 1024;
const line =
  JSON.stringify({
    t: Date.now(),
    type: 'chat',
    room: 'benchmark',
    player: 'test',
    text: 'space'.repeat(420),
  }) + '\n';
const recordBytes = Buffer.byteLength(line);
const records = Math.ceil(target / recordBytes);
let bytes = 0;
const source = Readable.from(
  (function* () {
    for (let i = 0; i < records; i++) {
      bytes += recordBytes;
      yield line;
    }
  })(),
);
console.log(`Generating ${sizeMb} MiB synthetic NDJSON log (${records} records)...`);
await pipeline(source, createWriteStream(file));
const server = createServer((req, res) => {
  if (req.url === '/replay') {
    void streamReplay(file, res).catch((error) => console.error(error));
  } else {
    res.writeHead(404);
    res.end();
  }
});
server.on('error', (error) => console.error(error));
await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
const url = `http://127.0.0.1:${server.address().port}/replay`;
const start = performance.now();
const samples = [];
const snapshot = () =>
  samples.push({
    seconds: (performance.now() - start) / 1000,
    rssMb: process.memoryUsage().rss / 1024 ** 2,
  });
let transfer = 0;
snapshot();
const interval = setInterval(snapshot, 200);
await new Promise((resolveDownload, rejectDownload) => {
  const request = get(url, (response) => {
    if (response.statusCode !== 200) {
      rejectDownload(new Error(`HTTP ${response.statusCode}`));
      return;
    }
    let windowBytes = 0;
    let paused = false;
    response.on('data', (chunk) => {
      transfer += chunk.length;
      windowBytes += chunk.length;
      // Simulated slow channel: pause incoming reads periodically, allowing TCP backpressure.
      if (windowBytes >= 1024 * 1024 && !paused) {
        paused = true;
        windowBytes = 0;
        response.pause();
        setTimeout(() => {
          paused = false;
          response.resume();
        }, pauseMs);
      }
    });
    response.on('end', resolveDownload);
    response.on('error', rejectDownload);
  });
  request.on('error', rejectDownload);
});
clearInterval(interval);
snapshot();
await new Promise((resolveClose) => server.close(resolveClose));
await rm(dir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
const rssValues = samples.map((v) => v.rssMb);
const min = Math.min(...rssValues),
  max = Math.max(...rssValues);
const width = 900,
  height = 300,
  left = 65,
  top = 28,
  graphW = width - 95,
  graphH = height - 85;
const maxX = Math.max(1, samples.at(-1).seconds),
  minY = Math.floor(min - 5),
  maxY = Math.ceil(max + 5);
const curve = samples
  .map(
    ({ seconds, rssMb }) =>
      `${(left + (seconds / maxX) * graphW).toFixed(1)},${(top + ((maxY - rssMb) / (maxY - minY)) * graphH).toFixed(1)}`,
  )
  .join(' ');
const axes = [0, 0.25, 0.5, 0.75, 1]
  .map((factor) => {
    const y = top + graphH * factor;
    const value = maxY - (maxY - minY) * factor;
    return `<line x1="${left}" y1="${y}" x2="${left + graphW}" y2="${y}" stroke="#cfd8e5" stroke-dasharray="3 5"/><text x="${left - 10}" y="${y + 4}" text-anchor="end" font-size="12" fill="#41526d">${value.toFixed(0)}</text>`;
  })
  .join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Measured RSS while downloading ${sizeMb} MiB through backpressured HTTP stream"><rect width="900" height="300" fill="#f8fbff" rx="12"/><text x="22" y="21" fill="#27344c" font-family="Arial" font-size="14" font-weight="bold">Node RSS under slowed ${sizeMb} MiB NDJSON replay</text><g font-family="Arial">${axes}<polyline fill="none" stroke="#148f91" stroke-width="3" points="${curve}" stroke-linejoin="round"/><text x="${left + graphW / 2}" y="${height - 22}" text-anchor="middle" fill="#41526d" font-size="12">Seconds (${maxX.toFixed(1)} s total) • pause ${pauseMs} ms each 1 MiB</text><text transform="translate(18,${top + graphH / 2}) rotate(-90)" text-anchor="middle" fill="#41526d" font-size="12">RSS (MiB)</text></g></svg>`;
await writeFile(join(outputDir, 'rss-lab-04.svg'), svg);
await writeFile(
  join(outputDir, 'rss-lab-04.csv'),
  'seconds,rss_mib\n' +
    samples.map((v) => `${v.seconds.toFixed(2)},${v.rssMb.toFixed(2)}`).join('\n') +
    '\n',
);
console.log(
  JSON.stringify(
    {
      sizeMiB: (bytes / 1024 ** 2).toFixed(2),
      transferredMiB: (transfer / 1024 ** 2).toFixed(2),
      durationSeconds: maxX.toFixed(2),
      samples: samples.length,
      minRssMiB: min.toFixed(2),
      maxRssMiB: max.toFixed(2),
      deltaRssMiB: (max - min).toFixed(2),
      chart: join(outputDir, 'rss-lab-04.svg'),
    },
    null,
    2,
  ),
);
