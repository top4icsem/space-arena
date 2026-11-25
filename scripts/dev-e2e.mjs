import { spawn } from 'node:child_process';

const processes = [
  spawn('npm', ['run', 'start'], { stdio: 'inherit' }),
  spawn('npm', ['run', 'dev:client'], { stdio: 'inherit' }),
];

function cleanup() {
  for (const child of processes) {
    if (child.exitCode === null) child.kill('SIGTERM');
  }
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

for (const child of processes) {
  child.on('error', (error) => {
    console.error(error);
    cleanup();
    process.exitCode = 1;
  });
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) process.exitCode = 1;
    cleanup();
  });
}
