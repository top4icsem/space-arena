import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

const exec = promisify(execFile);
const image = 'space-arena:lab08-smoke';
const run = async (...args) => (await exec('docker', args, { timeout: 180000 })).stdout.trim();
console.log('Building production image...');
await run('build', '--build-arg', 'BUILD_SHA=abcdef1234567', '-t', image, '.');
const bytes = Number(await run('image', 'inspect', '--format', '{{.Size}}', image));
console.log(`Image size: ${(bytes / 1024 / 1024).toFixed(1)} MiB`);
if (!(bytes < 200_000_000)) throw new Error('Image exceeds 200 MB requirement');
let container = '';
try {
  container = await run('run', '-d', '-P', '-e', 'ALLOWED_ORIGINS=http://localhost:3000', image);
  const portLine = await run('port', container, '3000/tcp');
  const port = Number(portLine.split(':').at(-1));
  if (!Number.isInteger(port)) throw new Error(`Cannot read exposed port: ${portLine}`);
  let response;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) break;
    } catch {
      /* wait for boot */
    }
    await delay(200);
  }
  if (!response?.ok) throw new Error('Docker /health never became ready');
  const health = await response.json();
  if (health.sha !== 'abcdef1234567') throw new Error('Wrong build SHA in /health');
  const ready = await fetch(`http://127.0.0.1:${port}/ready`);
  if (!ready.ok) throw new Error('/ready should be 200 before shutdown');
  const metrics = await fetch(`http://127.0.0.1:${port}/metrics`);
  if (!metrics.ok || !(await metrics.text()).includes('arena_players'))
    throw new Error('Metrics missing');
  const started = performance.now();
  const stopped = await exec('docker', ['stop', '--time', '8', container], { timeout: 10000 });
  const elapsed = performance.now() - started;
  console.log(`docker stop: ${elapsed.toFixed(0)} ms`, stopped.stdout.trim());
  if (elapsed >= 10000) throw new Error('Graceful shutdown took >= 10s');
  const exitCode = await run('inspect', '--format', '{{.State.ExitCode}}', container);
  if (exitCode !== '0') throw new Error(`Container stopped with exit code ${exitCode}, expected 0`);
  console.log('Container exit code: 0');
  await run('rm', container);
  container = '';
  console.log('Docker smoke OK');
} finally {
  if (container) await run('rm', '-f', container).catch(() => {});
}
