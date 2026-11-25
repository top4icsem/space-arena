import { cp, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

// Apply the Lab 05 overlay in the EXACT existing Lab 04 repo. Never modify .git.
const root = process.cwd();
const overlay = join(root, '.lab05_patch');
const exists = (file) =>
  stat(file).then(
    () => true,
    () => false,
  );
if (!(await exists(join(root, '.git')))) {
  throw new Error(
    'No .git here: open your existing Space Arena repo in VS Code. Do NOT unzip to a new empty folder.',
  );
}
if (
  !(await exists(join(root, 'client', 'src', 'main.js'))) ||
  !(await exists(join(root, 'server', 'src', 'rooms.js')))
) {
  throw new Error('Lab 04 layout missing (client/ and server/). Run inside the Lab 04 folder.');
}
if (!(await exists(join(overlay, 'shared', 'codec.js')))) {
  throw new Error(
    'Cannot find .lab05_patch: first unzip space-arena-lab-05-update.zip in this folder.',
  );
}
const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
  cwd: root,
  encoding: 'utf8',
});
if (status.trim())
  throw new Error(
    `Commit/stash the already modified Lab 04 files before applying Lab 05:\n${status}`,
  );
await mkdir(join(root, 'docs'), { recursive: true });
if (!(await exists(join(root, 'docs', 'lab-04-readme.md')))) {
  await cp(join(root, 'README.md'), join(root, 'docs', 'lab-04-readme.md'));
}
let count = 0;
async function copyTree(from, to) {
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from, { withFileTypes: true })) {
    const source = join(from, entry.name),
      destination = join(to, entry.name);
    if (entry.isDirectory()) await copyTree(source, destination);
    else if (entry.isFile()) {
      await cp(source, destination, { force: true });
      count++;
    } else throw new Error(`Unexpected overlay entry ${entry.name}`);
  }
}
await copyTree(overlay, root);
await rm(overlay, { recursive: true, force: true });
await rm(join(root, 'package-lock.json'), { force: true });
// Older zip of Lab 04 contained two no-useless-escape warnings. Keep those optional,
// historical migration scripts lint-clean in user repos too, without changing behavior.
for (const filename of ['apply-lab04.mjs', 'scripts/migrate-lab04.mjs']) {
  const path = join(root, filename);
  if (!(await exists(path))) continue;
  const original = await readFile(path, 'utf8');
  const fixed = original.replaceAll("Won\\'t", "Won't");
  if (fixed !== original) await (await import('node:fs/promises')).writeFile(path, fixed);
}
console.log(`Lab 05 applied: ${count} files overlaid. Previous README -> docs/lab-04-readme.md.`);
console.log('Next: npm install && npm run format && npm run check && npm run dev');
