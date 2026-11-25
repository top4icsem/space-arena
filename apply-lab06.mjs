import { access, copyFile, mkdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';

const root = process.cwd();
const paths = [
  'shared/flight',
  'shared/prng',
  'shared/codec',
  'shared/world',
  'server/src/config',
  'server/src/protocol',
  'server/src/rooms',
  'server/src/ws',
  'server/src/http',
  'server/src/index',
  'server/src/log/matchlog',
  'server/src/log/replay',
  'server/src/network/ticker',
  'server/src/network/realtime',
  'client/src/network/connection',
  'client/src/network/netcode',
];
const exists = async (file) =>
  access(file).then(
    () => true,
    () => false,
  );
if (!(await exists(join(root, 'client'))) || !(await exists(join(root, 'server')))) {
  throw new Error('Запускай скрипт з кореня старого проєкту Space Arena (там, де package.json).');
}
if (!(await exists(join(root, '.git')))) {
  throw new Error('Папка .git не знайдена: не запускай оновлення в новому репозиторії.');
}
for (const stem of paths)
  if (!(await exists(join(root, `${stem}.ts`)))) {
    throw new Error(`Не вистачає ${stem}.ts — спочатку розпакуй ZIP у корінь поточного проєкту.`);
  }
const stagedReadme = join(root, '.lab06_patch', 'README.md');
if (!(await exists(stagedReadme))) throw new Error('Не вистачає .lab06_patch/README.md');
const previousReadme = join(root, 'docs', 'lab-05-readme.md');
await mkdir(dirname(previousReadme), { recursive: true });
if (!(await exists(previousReadme))) {
  await copyFile(join(root, 'README.md'), previousReadme);
  console.log('Збережено README п’ятої лабораторної: docs/lab-05-readme.md');
}
for (const stem of paths) {
  const old = join(root, `${stem}.js`);
  if (await exists(old)) {
    await rm(old);
    console.log(`JavaScript → TypeScript: ${stem}`);
  }
}
await copyFile(stagedReadme, join(root, 'README.md'));
await rm(join(root, '.lab06_patch'), { recursive: true, force: true });
console.log('\n✅ Lab 06 додано поверх поточного репозиторію, .git і теги не змінені.');
console.log('Далі: npm install → npm run format → npm run check → npm run dev');
