import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');

// One terminal command runs the API/WS backend and Vite. Ctrl+C closes both.
const commands = [
  ['server', ['run', 'dev', '-w', 'server']],
  ['client', ['run', 'dev', '-w', 'client']],
];
const children = commands.map(([name, args]) => {
  const child = spawn('npm', args, {
    stdio: 'inherit',
    env: process.env,
    detached: process.platform !== 'win32',
  });
  child.on('error', (error) => console.error(`[${name}]`, error));
  return child;
});
let closed = false;
function closeAll(signal = 'SIGTERM') {
  if (closed) return;
  closed = true;
  for (const child of children) {
    if (child.exitCode !== null || !child.pid) continue;
    try {
      // On macOS/Linux stop the entire npm+Node/Vite process group.
      if (process.platform === 'win32') child.kill(signal);
      else process.kill(-child.pid, signal);
    } catch (error) {
      if (error.code !== 'ESRCH') console.error(error);
    }
  }
}
process.on('SIGINT', () => closeAll('SIGINT'));
process.on('SIGTERM', () => closeAll('SIGTERM'));
for (const child of children)
  child.on('exit', (code) => {
    if (code !== 0 && !closed) closeAll();
  });
