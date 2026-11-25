import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { relative, resolve, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const patch = join(root, '.lab08_patch');
const exists = (file) =>
  stat(file).then(
    () => true,
    () => false,
  );
if (
  !(await exists(join(root, '.git'))) ||
  !(await exists(join(root, 'server/src/ws.ts'))) ||
  !(await exists(join(root, 'shared/world.ts'))) ||
  !(await exists(join(root, 'package.json')))
) {
  throw new Error('Відкрий корінь ІСНУЮЧОГО Space Arena після ЛР №7, де є .git та package.json.');
}
if (!(await exists(join(patch, 'server/src/telemetry.ts')))) {
  throw new Error('Спочатку розпакуй увесь ZIP у корінь існуючого проєкту.');
}
if (await exists(join(root, 'docs/lab08-deploy.md'))) {
  throw new Error('Lab08 уже встановлена. Не запускай інсталятор двічі; перевір git status.');
}
// Safety: only install on clean tracked files, preserving the previous tags and history.
const { execFileSync } = await import('node:child_process');
const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
  cwd: root,
  encoding: 'utf8',
});
if (status.trim()) throw new Error(`Спочатку git commit/stash наявні зміни:\n${status}`);
let count = 0;
async function apply(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const from = join(dir, entry.name),
      rel = relative(patch, from),
      to = resolve(root, rel);
    if (to === root || !to.startsWith(root + sep) || rel.split(sep).includes('.git'))
      throw new Error(`Unsafe file path ${rel}`);
    if (entry.isDirectory()) {
      await mkdir(to, { recursive: true });
      await apply(from);
    } else if (entry.isFile()) {
      // Preserve any working E2E runner from the fixed Lab07 installation.
      if (rel === 'scripts/dev-e2e.mjs' && (await exists(to))) continue;
      await cp(from, to, { force: true });
      count++;
    } else throw new Error(`Unexpected file ${rel}`);
  }
}
await apply(patch);
async function tweak(path, action) {
  const full = join(root, path);
  const original = await readFile(full, 'utf8');
  const result = action(original);
  if (typeof result !== 'string') throw new Error(`Bad patch for ${path}`);
  if (result !== original) await writeFile(full, result);
}
await tweak('package.json', (text) => {
  const data = JSON.parse(text);
  data.version = '1.0.0';
  data.description = 'Space Arena Lab 08 — Docker, observability, safe shutdown, PWA, CI/CD';
  data.scripts['dev:e2e'] = data.scripts['dev:e2e'] || 'node scripts/dev-e2e.mjs';
  data.scripts['test:docker'] = 'node scripts/docker-smoke.mjs';
  data.scripts['fault:frames'] = 'node scripts/fault-client.mjs';
  return JSON.stringify(data, null, 2) + '\n';
});
await tweak('server/package.json', (text) => {
  const data = JSON.parse(text);
  data.version = '1.0.0';
  data.dependencies = { ...data.dependencies, pino: '^9.9.5' };
  return JSON.stringify(data, null, 2) + '\n';
});
for (const path of ['client/package.json', 'shared/package.json']) {
  await tweak(path, (text) => {
    const data = JSON.parse(text);
    data.version = '1.0.0';
    return JSON.stringify(data, null, 2) + '\n';
  });
}
await tweak('client/index.html', (html) => {
  if (!html.includes('href="/manifest.webmanifest"')) {
    const anchor = '<meta name="theme-color" content="#090d18" />';
    if (!html.includes(anchor)) throw new Error('client/index.html theme-color marker missing');
    html = html.replace(
      anchor,
      anchor +
        '\n    <link rel="manifest" href="/manifest.webmanifest" />\n    <link rel="apple-touch-icon" href="/icons/icon-192.png" />\n    <meta name="apple-mobile-web-app-capable" content="yes" />\n    <meta name="apple-mobile-web-app-title" content="Space Arena" />',
    );
  }
  return html.replace('BUILD 0.7.0', 'BUILD 1.0.0').replace('LAB 07 OF 08', 'LAB 08 OF 08');
});
await tweak('client/src/main.js', (source) => {
  if (!source.includes("connection.addEventListener('shutdown'")) {
    const marker = "connection.addEventListener('snapshot', ({ detail }) => {";
    if (!source.includes(marker)) throw new Error('client/src/main.js snapshot listener not found');
    source = source.replace(
      marker,
      `connection.addEventListener('shutdown', () => {
  if (networkMode && phase === 'playing') {
    void showLobby();
    $('#system-status').textContent = 'SERVER DISCONNECTED · RECONNECT FROM LOBBY';
  }
});
` + marker,
    );
  }
  if (!source.includes("navigator.serviceWorker.register('/sw.js')")) {
    const marker = "window.addEventListener('pagehide', () => {";
    if (!source.includes(marker)) throw new Error('client/src/main.js pagehide marker not found');
    source = source.replace(
      marker,
      `if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) =>
      console.warn('[PWA] Service worker registration failed', error),
    );
  }, { once: true });
}
` + marker,
    );
  }
  return source;
});
await tweak('client/src/network/connection.ts', (source) => {
  if (!source.includes("payload.type === 'shutdown'")) {
    const marker = "      if (payload.type === 'snapshot') {";
    if (!source.includes(marker)) throw new Error('connection.ts snapshot marker missing');
    source = source.replace(
      marker,
      `      if (payload.type === 'shutdown') {
        this.emit('status', String(payload.reason || 'Server shutting down'));
        return;
      }
` + marker,
    );
  }
  if (!source.includes('[1001, 1006, 1011].includes(event.code)')) {
    const anchor = '      if (!this.manual) this.scheduleRetry();\n    });';
    if (!source.includes(anchor)) throw new Error('connection.ts close marker missing');
    source = source.replace(
      anchor,
      `      if (!this.manual && [1001, 1006, 1011].includes(event.code)) {
        this.manual = true;
        this.emit('shutdown', { reason: \`Connection closed (\${event.code})\` });
        return;
      }
` + anchor,
    );
  }
  return source;
});
await tweak('playwright.config.ts', (source) =>
  source.replace("command: 'npm run dev'", "command: 'npm run dev:e2e'"),
);
const intro = await readFile(join(root, 'docs/README_LAB08_INTRO.md'), 'utf8');
await tweak('README.md', (previous) => {
  if (previous.startsWith('# SPACE ARENA — Lab 08:')) return previous;
  return intro + '\n' + previous.replace(/^# SPACE ARENA[^\n]*\n/, '');
});
await rm(patch, { recursive: true, force: true });
console.log(`✅ Lab 08 installed: ${count} files, previous Git history preserved.`);
console.log('NEXT: npm install --include=optional && npm run format && npm run check');
console.log('THEN: CI=true npm run test:e2e && npm run test:docker');
